# Claymod

**Change any website by describing the change.**

"Hide the Shorts shelf." "Make this page dark, in my colours." "Put the search box at the top."
Claymod asks an AI model to write that change **once**, as a small **mod** (CSS and/or JS). After
that, the extension re-applies the mod on every visit with **no AI calls**, checks that it still
fits the page, and helps you repair it when the site changes.

- **Your model, your key.** OpenAI-compatible endpoints (Ollama, LM Studio, OpenRouter, OpenAI),
  the Anthropic API, or a local agent such as Claude Code through the optional bridge.
- **Private by default.** Page snapshots go only to the provider you configure. No telemetry,
  no Claymod server.
- **Safe by design.** Generated JS runs only in Chrome's isolated user-script world, only on the
  sites the mod declares, and only after you preview it. Site access is requested per site.

> Status: early development. See [the roadmap](docs/roadmap.md).

<!-- Demo GIF goes here after M3. -->

## Quick start

> Placeholder: install instructions land with the first release (M6).

To try the development build:

```bash
git clone https://github.com/ramiborni/claymod.git
cd claymod
bun install
bun dev        # opens Chrome with Claymod loaded
```

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/core` | Pure TypeScript: mod schema, prompts, model providers, validation, health checks |
| `packages/extension` | The Chrome extension (WXT, Manifest V3) |
| `packages/bridge` | `claymod-bridge` CLI: native messaging host and MCP server for local agents |
| `mods/` | Starter mods |
| `docs/` | [Architecture](docs/architecture.md), [mod format](docs/mod-format.md), [roadmap](docs/roadmap.md), [decisions](docs/decisions) |

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md); a first PR (a starter mod or a new provider) takes
about 15 minutes. Please report security issues privately, as described in [SECURITY.md](SECURITY.md).
Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
