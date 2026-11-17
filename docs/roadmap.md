# Roadmap

The MVP is built one milestone at a time. Each milestone ends with `bun run check` and all tests
passing, and a short summary of what changed, how to try it, and what's left.

## M0 — Foundation ✅

- Bun workspaces monorepo: `packages/core`, `packages/extension` (WXT, MV3), `packages/bridge`,
  `mods/`, `docs/`.
- Shared strict `tsconfig`, Biome, `bun test`, Playwright smoke test that loads the built extension.
- GitHub Actions CI on pull requests and `main`: install (frozen lockfile), check, unit tests,
  build, e2e.
- README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE, architecture, mod format, roadmap,
  ADR 0001.
- Issue templates (bug, mod request, new provider), PR template, Changesets.

**Done when:** a fresh clone passes `bun install && bun run check && bun test`, and CI is green.

## M1 — Core

- Mod schema v1 in Zod, JSON Schema export script, validation helpers.
- Snapshot type: URL, title, picked element (selector + truncated outerHTML), simplified DOM
  outline capped at about 30 KB.
- Prompt builders for create and repair; the model answers with JSON matching the schema.
- `ModelProvider` interface with `openai-compatible` and `anthropic` adapters.
- Parse → validate → one retry that feeds the validation errors back.
- Pure health evaluator (3 consecutive failures → `needs-repair` by default).

**Done when:** unit tests cover the schema, prompts, both adapters (recorded responses), the retry
and the evaluator, with no network access.

## M2 — Create flow

- Side panel: request box, Pick element, Generate, preview with Keep / Discard / View code.
- Content script: element picker and snapshot builder.
- Options page: provider, base URL, model, API key, Test connection with actionable errors
  (including the Ollama `OLLAMA_ORIGINS` fix with the real extension ID).
- Keep requests host permission for that site only; Discard fully reverts the preview.

**Done when:** an e2e test on a fixture page creates a mod with a mocked provider, previews it,
keeps it, and finds it in storage.

## M3 — Apply, health, manage, share

- CSS injected at `document_start`; JS registered with `chrome.userScripts` and synced with
  storage; clear instructions when user scripts are switched off.
- SPA support: debounced `MutationObserver` and history-navigation hooks.
- Per-mod check results, needs-repair badge, Repair (new version, max 5 kept), Undo.
- Mod manager (this site / all sites), per-site kill switch, export / import (imported JS disabled
  until reviewed).

**Done when:** e2e tests show a mod surviving a reload, re-applying on an SPA fixture, a changed
fixture triggering needs-repair, and imports requiring review.

## M4 — Bridge and local agents

- `claymod-bridge` binaries for macOS (arm64, x64), Linux x64, Windows x64.
- `install` / `uninstall` / `doctor`; native messaging manifest limited to the Claymod extension ID.
- `host`: length-prefixed JSON framing, request IDs, timeouts.
- `AgentRunner` with Claude Code (headless, API key auth only) and Codex runners.
- Extension provider "Local agent (bridge)".

**Done when:** framing is unit-tested, an integration test runs against a fake agent binary, and
the manual setup is documented.

## M5 — MCP: agents drive Claymod

- `claymod-bridge mcp` with `get_active_page`, `list_mods`, `preview_mod`, `save_mod`,
  `get_mod_status`, reaching the host over a user-only local socket with a random token.
- `preview_mod` and `save_mod` need confirmation in the side panel.
- Docs for Claude Code, Codex and OpenCode.

**Done when:** an integration test passes against a mocked host and the manual demo is documented.

## M6 — Starter mods and releases

- Ten starter mods tested on synthetic fixtures.
- `release.yml`: Changesets version PR → tag → extension zip + bridge binaries → GitHub Release
  with checksums and provenance attestations. Manual Chrome Web Store upload documented.
- Final README.

**Done when:** a dry-run release on a fork produces all artifacts.

## Out of scope for the MVP

Tauri desktop app, Firefox build, hosted mod registry, accounts, telemetry, automatic repair
without a user click.
