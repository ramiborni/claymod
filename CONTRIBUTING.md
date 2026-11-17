# Contributing to Claymod

Thanks for helping. Read [CLAUDE.md](CLAUDE.md) once: it holds the product rules, architecture and
code style that every change follows, for humans and AI assistants alike.

## Setup (one command)

You need [Bun](https://bun.sh) 1.2 or newer and Git.

```bash
bun install && bun run check && bun test
```

That installs everything, lints, type-checks and runs the unit tests. Other commands:

| Command | What it does |
| --- | --- |
| `bun dev` | Runs the extension in Chrome with live reload |
| `bun run check` | Biome lint/format check and TypeScript across all packages |
| `bun run check:fix` | Applies Biome's safe fixes and formatting |
| `bun test` | Unit tests (no network) |
| `bun run e2e` | Builds the extension and runs Playwright tests against synthetic fixture pages |
| `bun run cypress` | Builds the extension and runs Cypress UI tests for the side panel and options page (`bun run --cwd packages/extension cypress:open` for the interactive runner) |
| `SCREENSHOTS_DIR=… bun run --cwd packages/extension screenshots` | Captures the UI in light and dark mode |
| `bun run build` | Builds every package |
| `bun run bridge:compile` | Compiles the bridge into a single binary |
| `bunx changeset` | Describes a user-visible change for the changelog |

The first time you run `bun run e2e` locally, install the browser with
`cd packages/extension && bunx playwright install chromium`. Cypress downloads its binary on
`bun install`; if it didn't, run `cd packages/extension && bunx cypress install`.

## Your first PR in 15 minutes

Pick one of these. Both are self-contained and reviewed quickly.

### Option A: add a starter mod

1. Create `mods/<site>-<what-it-does>.json` following the [mod format](docs/mod-format.md).
   Use match patterns as narrow as the change allows, and at least one check selector.
2. Add a **synthetic** fixture page to `packages/extension/tests/fixtures/` that has the same
   structure your selectors rely on. Write it by hand: never copy a real site's HTML.
3. Add a test showing the mod applies to the fixture.
4. Run `bun run check && bun test`, add a changeset (`bunx changeset`), open a PR.

### Option B: add a model provider

1. Add one file in `packages/core/src/providers/` that wraps a LangChain chat model
   (`@langchain/<vendor>`) as a `ModelProvider` using `completeWithLangChain` (see `anthropic.ts`
   for a complete example). Pass the injected `fetch` to the vendor SDK, pick a structured-output
   method the vendor's current models accept, add the settings to `providers/config.ts` and
   register it in `providers/index.ts`. Error messages must tell the user what to do next.
2. Record a real response once and save it in `packages/core/tests/recordings/<provider>/`
   (see the README there). Test against it with `replayFetch` from `tests/helpers.ts`.
   Unit tests can't reach the network: `fetch` is blocked in the test setup.
3. Only support access the vendor allows: the user's own API key or a local runtime.
   Never a consumer subscription login.
4. Run `bun run check && bun test`, add a changeset, open a PR.


## Pull requests

- Keep PRs small and focused. Use [conventional commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `chore:` ...).
- Every bug fix includes a test that fails without the fix.
- Every user-visible change includes a changeset.
- Update docs in the same PR when behaviour changes.
- Open an issue first before adding a dependency, changing the mod schema or widening the
  extension's permissions.
