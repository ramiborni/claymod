# Architecture

Claymod is a Bun workspaces monorepo with three packages. [CLAUDE.md](../CLAUDE.md) holds the
rules; this page explains how the pieces fit.

```text
            ┌──────────────────────── Chrome ────────────────────────┐
            │  side panel ──► background (service worker) ◄── content │
            │   (create,       orchestration, storage,       snapshot, │
            │    preview,      providers, userScripts sync   picker,   │
            │    manage)                │                     CSS,     │
            │                           │                     checks   │
            └───────────────────────────┼──────────────────────────────┘
                     direct fetch       │       native messaging (optional)
              ┌─────────────────────────┴──────────┐
              ▼                                    ▼
     model provider (user's key           claymod-bridge ──► local agent
     or local runtime)                     (host, mcp)        (Claude Code, Codex)
```

## Packages

### `packages/core`

Pure TypeScript with no browser or Node APIs, so it runs in the service worker, the bridge and
tests alike. It owns:

- the mod schema (Zod), which is the single source of truth, and its JSON Schema export;
- snapshot types;
- prompt builders for create and repair;
- the `ModelProvider` interface and fetch-based adapters;
- output validation with one repair retry;
- the health evaluator.

Functions return `Result` values instead of throwing for expected failures.

### `packages/extension`

WXT, Manifest V3, Chrome first.

| Entrypoint | Responsibility |
| --- | --- |
| `background` | Orchestration, provider calls, storage, `chrome.userScripts` registration |
| `content` | Page snapshot, element picker, CSS apply, health checks, SPA observer (from M2) |
| `sidepanel` | Create, preview and manage mods |
| `options` | Provider settings |

The manifest asks only for `storage` and `sidePanel` at install. Host access is requested per site
when a mod is kept.

### `packages/bridge`

A Bun CLI compiled into a single binary. It is optional: the extension works fully without it.
Commands: `install`, `uninstall`, `host` (native messaging), `mcp` (MCP stdio server), `doctor`.
Local agents plug in through the `AgentRunner` interface.

## Data flow

- **Create:** side panel request + picked element → content snapshot → background → provider
  (direct) or bridge → model → JSON → core validation → preview (temporary apply) → Keep →
  storage + per-site permission + userScripts registration.
- **Visit:** content script matches URL → applies CSS (JS is already registered via userScripts) →
  runs checks → reports status to background. No model or server is called.
- **Repair:** checks fail on N consecutive visits (default 3) → mod marked `needs-repair` → user
  clicks Repair → old mod + new snapshot → provider → new version saved, old one kept.

## Testing

| Package | How |
| --- | --- |
| core | `bun test`, no network; providers tested with recorded responses |
| extension | Playwright loads the built extension (`.output/chrome-mv3`) against synthetic fixture pages |
| bridge | Unit tests for framing and runners, with process spawning mocked |
