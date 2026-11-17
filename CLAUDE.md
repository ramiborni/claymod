# Claymod

Claymod lets anyone change how a website looks and works by describing the change.
AI writes the change once as a small **mod** (CSS and/or JS). The extension re-applies it on
every visit with no AI calls, checks that it still fits the page, and repairs it when the site changes.

This file is the source of truth for rules and architecture. Read it before every task.

## Product rules (non-negotiable)

- **AI runs only to create or repair a mod.** Applying a mod never calls a model or a server.
- **Mods live in the extension's storage.** The extension must work fully without the bridge installed.
- **Privacy:** page snapshots go only to the provider the user configured. No telemetry by default.
  No Claymod-hosted server in the MVP.
- **Security:**
  - Generated JS runs only through `chrome.userScripts` in the `USER_SCRIPT` world, only on the
    mod's declared `matches`, and only after the user has previewed it.
  - Imported mods keep their JS disabled until the user has viewed the code and enabled it.
  - Never `eval` in extension pages. Never fetch code at runtime.
- **Permissions:** request host access per site when a mod is kept (`optional_host_permissions`),
  never `<all_urls>` at install time.
- **Vendor terms:** users bring their own API keys. Never implement claude.ai login or route requests
  through a user's Claude subscription; Anthropic does not permit third-party products to offer
  claude.ai login or rate limits unless approved. Follow every vendor's terms the same way.

## Architecture

Bun workspaces monorepo:

```text
packages/core/       Pure TypeScript. No browser or Node APIs.
                     Mod schema (Zod, single source of truth) + JSON Schema export,
                     snapshot types, prompt builders, ModelProvider interface + adapters
                     (LangChain JS chat models), output validation with one repair retry
                     (LangGraph JS graph), health-check evaluator.
packages/extension/  WXT, Manifest V3, Chrome first (Firefox later).
                     entrypoints/background  orchestration, providers, storage, userScripts sync
                     entrypoints/content     snapshot, element picker, CSS apply, checks, SPA observer
                     entrypoints/sidepanel   create / preview / manage UI
                     entrypoints/options     provider settings
packages/bridge/     Bun CLI, compiled with `bun build --compile`.
                     Commands: install, uninstall, host (native messaging), mcp (MCP stdio), doctor.
                     AgentRunner interface; runners: claude-code, codex.
mods/                Starter mods as JSON, validated in CI.
docs/                architecture.md, mod-format.md, roadmap.md, decisions/ (ADRs).
```

### Data flow

- **Create:** side panel request + picked element -> content snapshot -> background ->
  provider (direct) or bridge -> model -> JSON -> core validation -> preview (temporary apply)
  -> Keep -> storage + per-site permission + userScripts registration.
- **Visit:** content script matches URL -> applies CSS (JS is already registered via userScripts)
  -> runs checks -> reports status to background.
- **Repair:** checks fail on N consecutive visits (default 3) -> mod marked `needs-repair`
  -> user clicks Repair -> old mod + new snapshot -> provider -> new version saved, old one kept.

## Mod format v1

Defined in `packages/core/src/mod/schema.ts` (Zod). Do not change it without asking.

| Field | Type | Notes |
| --- | --- | --- |
| schemaVersion | `1` | |
| id | uuid | |
| name, description | string | Short, human-readable |
| matches | string[] | Chrome match patterns, at least one |
| css | string? | At least one of css / js |
| js | string? | Runs in the USER_SCRIPT world |
| runAt | `document_start` \| `document_end` \| `document_idle` | |
| checks | `{ selector: string, expect: "exists" }[]` | At least one; used for health |
| version | int | Incremented on repair or edit |
| createdBy | `{ provider: string, model: string }` | |
| createdAt, updatedAt | ISO string | |
| history | previous versions | Keep at most 5 |

## Extension points (how contributors add things)

- **New model provider:** one file in `packages/core/src/providers/` wrapping a LangChain chat model
  as a `ModelProvider`, registered in the index, with a recorded-response test.
- **New agent runner:** one file in `packages/bridge/src/runners/` implementing `AgentRunner`.
- **New starter mod:** one JSON file in `mods/` plus a fixture-page test.

## Code style

- TypeScript `strict`. No `any`. No non-null `!` without a comment explaining why.
- Derive types from Zod schemas (`z.infer`) instead of duplicating them.
- Biome for lint and format. Run `bun run check` before every commit.
- One responsibility per file; aim for files under ~200 lines and functions under ~40 lines.
- Pure functions in `core`; side effects only at the edges (background, content, bridge commands).
- In `core`, return typed results (`{ ok: true, value } | { ok: false, error }`); throw only for
  programmer errors.
- User-facing errors must say what to do next, e.g.
  "Ollama blocked the extension. Set OLLAMA_ORIGINS=chrome-extension://<id> and restart Ollama."
- Prefer clear names over comments; comment the *why*, not the *what*.
- No new dependency without a one-line justification. Prefer the platform.

## Testing

- `core`: `bun test`, no network. Providers are tested with recorded responses.
- `extension`: Playwright loading the built extension against **synthetic** fixture pages in
  `packages/extension/tests/fixtures/`. Never copy third-party site HTML; never hit live sites in CI.
  Cypress tests the UI pages (side panel, options) as plain web pages with a fake extension API
  (`packages/extension/cypress/`), covering every UI state quickly and deterministically.
- `bridge`: unit tests for native messaging framing and runners (process spawning mocked).
- Every bug fix comes with a test that fails before the fix.

## Commands

```bash
bun install            # install everything
bun dev                # extension dev mode (WXT) in Chrome
bun run check          # biome + tsc across all packages
bun test               # unit tests
bun run e2e            # Playwright end-to-end tests (real extension)
bun run cypress        # Cypress UI tests (side panel, options) with a fake extension API
bun run build          # build all packages
bun run bridge:compile # single-file bridge binaries
bunx changeset         # describe a user-visible change
```

## Git and releases

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:` ...).
- Every user-visible change includes a changeset.
- `main` is always releasable; CI must be green; keep PRs small.

## Working rules for Claude Code

- Verify browser, extension and MCP APIs against current official docs before using them
  (Chrome `userScripts`, `sidePanel`, `nativeMessaging`, `permissions`; WXT; the MCP TypeScript SDK;
  Claude Code and Codex headless CLI flags). Do not rely on memory.
- Work one milestone at a time from `docs/roadmap.md`: plan briefly, implement, run
  `bun run check` and the tests, then stop and summarise what changed, how to try it, and what's left.
- Update the docs in the same change when behaviour changes.
- Ask before adding a dependency, changing the mod schema, or widening permissions.
