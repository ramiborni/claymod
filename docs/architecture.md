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

| Folder | What's inside |
| --- | --- |
| `mod/` | Zod schema, match-pattern validation, validation helpers, JSON Schema export, versioning (repair / undo with history) |
| `snapshot/` | Snapshot type, outline renderer (breadth-first, ~30 KB cap), byte-safe truncation |
| `prompts/` | Create and repair prompt builders, retry feedback |
| `providers/` | `ModelProvider` interface wrapping LangChain chat models (`ChatOpenAICompletions`, `ChatAnthropic`), error mapping, provider config schema, registry |
| `generate/` | LangGraph `StateGraph` (`callModel → validate → addFeedback → callModel`, at most 2 calls) behind `generateModDraft`; JSON extraction |
| `health/` | Pure health evaluator (needs repair after 3 failed visits in a row by default) |

Models are called through LangChain JS and orchestrated with LangGraph JS (imported from
`@langchain/langgraph/web`, which needs no Node APIs), so the same code runs in the service worker
and the bridge. Providers accept a `fetch` that is handed to the vendor SDK, which is how tests
replay recorded responses. See [ADR 0003](decisions/0003-langchain-and-langgraph.md). Page snapshots are wrapped in `<page_snapshot>` and the
system prompt tells the model to treat them as untrusted data.

### `packages/extension`

WXT, Manifest V3, Chrome first.

| Entrypoint | Responsibility |
| --- | --- |
| `background` | Orchestration, provider calls, storage, `chrome.userScripts` registration |
| `content` | Page snapshot, element picker, CSS apply, health checks, SPA observer (from M2) |
| `sidepanel` | Create, preview and manage mods |
| `options` | Provider settings |

### Permissions

| Permission | Why |
| --- | --- |
| `storage` | Mods and provider settings in `chrome.storage.local`; previews in `storage.session` |
| `sidePanel` | The main UI |
| `activeTab` | Read and preview the page you're on, after you click the Claymod icon |
| `scripting` | Inject the picker/snapshot content script and preview CSS on that tab |
| `userScripts` | Preview (and, from M3, run) generated JS in the isolated `USER_SCRIPT` world |
| `optional_host_permissions: http://*/*, https://*/*` | Nothing at install; **Keep** asks for the mod's sites only |

Clicking the toolbar icon opens the side panel from `action.onClicked`, so the click grants
`activeTab` for the current page. If you navigate to another site, click the icon again (or keep
a mod for that site, which grants lasting access).

### Create flow (M2)

1. **Pick element** (optional): the background injects `content-scripts/content.js` with
   `chrome.scripting` (it is never declared in the manifest) and the page shows a hover
   highlight; click picks, Esc cancels. The picker builds a short, stable selector.
2. **Generate**: the content script walks the DOM into an outline (core renders it, ~30 KB cap);
   the background runs `generateModDraft` with the configured provider.
3. **Preview**: CSS via `scripting.insertCSS` on that tab only; JS via `userScripts.execute`
   in the `USER_SCRIPT` world when user scripts are enabled (otherwise the panel explains how).
4. **Keep** asks for host permission for the mod's `matches` (from the click's user gesture),
   then saves the mod. **Discard** removes the CSS, or reloads the tab if JS ran.

### Apply, health and manage (M3)

- **Storage.** `mods` holds mods exactly in the [mod format](mod-format.md). Local settings live
  beside them so exports never carry them: `modState` (enabled, JS reviewed, last 10 check runs,
  health) and `pausedSites` (the per-site kill switch).
- **CSS on every visit.** The background registers one content script,
  `content-scripts/apply.js`, with `scripting.registerContentScripts` for the *whole site* of
  every enabled mod (single-page apps change paths without a page load), at `document_start`.
  It adds one `<style>` per matching mod, re-attaches styles a page removes (debounced
  `MutationObserver`), follows URL changes (Navigation API `currententrychange`, `popstate`,
  `hashchange`), and applies storage changes live (enable, pause, repair, undo).
- **JS on every visit.** Each enabled mod with reviewed JS is one `chrome.userScripts`
  registration in the `USER_SCRIPT` world, on the mod's `matches`, with paused sites in
  `excludeMatches`. `lib/background/sync.ts` keeps registrations equal to storage; it runs on
  storage and permission changes, install/startup, each visit and when the mod list opens (so
  switching on "Allow User Scripts" takes effect), and skips the work when nothing changed.
- **JS review.** JS runs only after the user saw it: it ran in the preview, or they opened the
  code. Imported mods start with JS off until the user opens the code and clicks
  **Enable JavaScript**.
- **Health.** Once per visit (and per SPA navigation), after the DOM settles, the apply script
  evaluates each mod's checks (one extra wait for late content), and reports them. The
  background records the run, evaluates health (core: 3 failed visits in a row → needs repair)
  and sets the toolbar badge: the number of active mods, or `!` when one needs repair.
- **Repair** snapshots the page, sends the mod, failed selectors and snapshot to the model,
  previews the result, and **Save repair** stores it as the next version (old one in history,
  max 5). **Undo** restores the previous version.
- **Export / import.** Export writes `{ format: "claymod-mods", formatVersion: 1, mods }`.
  Import accepts that, an array or a single mod, validates each one, and adds valid mods as new
  copies with fresh ids.

Pages talk to the background over one long-lived port (`lib/rpc`) with a heartbeat, so the MV3
service worker stays alive during long model calls. Only Claymod's own pages may connect.

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
| extension (UI) | Cypress loads the built side panel and options pages over http with a fake `chrome` API (`cypress/support/fake-chrome.ts`) and scripted background answers, so every UI state (loading, errors, permission refused, …) is tested without a browser extension |
| extension | `bun test` for pure helpers; Playwright loads the `e2e` build (`.output/chrome-mv3-e2e`) against synthetic fixture pages served by a local mock server that is also a fake OpenAI-compatible model. The `e2e` build mode only adds `host_permissions: http://127.0.0.1/*`, because Playwright can't click the toolbar icon or answer permission prompts |
| bridge | Unit tests for framing and runners, with process spawning mocked |
