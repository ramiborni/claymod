# Local agents (claymod-bridge)

`claymod-bridge` lets Claymod create and repair mods with an AI agent CLI already installed on
your computer, instead of calling a model API from the browser. It is optional: Claymod works
fully without it.

| Agent | Command | Sign-in options |
| --- | --- | --- |
| Claude Code | `claude` | The CLI's own sign-in, or an Anthropic API key |
| Codex | `codex` | The CLI's own sign-in, or an OpenAI API key |
| Gemini CLI | `gemini` | A Gemini API key (recommended), or the CLI's own sign-in ⚠️ |
| Antigravity CLI | `agy` | A Gemini API key (recommended), or the CLI's own sign-in ⚠️ |

⚠️ Google says third-party tools that use Gemini CLI or Antigravity sign-in break its terms, and
has suspended accounts over it
([Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)).
Claymod runs the official CLI unchanged, but Google hasn't said whether that's allowed, so
Claymod defaults these two to an API key and asks you to confirm before using their sign-in.
See [ADR 0004](decisions/0004-local-agents.md).

## How it works

```text
side panel ─► background ──connectNative──► claymod-bridge ──spawn──► claude / codex / gemini / agy
                 ▲                              │   (length-prefixed JSON over stdin/stdout)
                 └── validates the answer ◄─────┘
```

Chrome starts the bridge when Claymod needs it and stops it when the request is done. The bridge
runs the agent once, headless, in an empty temporary folder, with no tools and no saved session,
and returns the agent's answer. The extension then validates it with the same schema (and one
retry) as every other provider, and you preview the mod before keeping it.

## Set up

1. **Install an agent** and check it works in a terminal, for example `claude -p "hi"`.
2. **Download `claymod-bridge`** for your system from the releases page
   (`claymod-bridge-darwin-arm64`, `-darwin-x64`, `-linux-x64` or `-windows-x64.exe`), rename it
   to `claymod-bridge` (`claymod-bridge.exe` on Windows), make it executable
   (`chmod +x claymod-bridge`) and put it somewhere permanent, like `~/.local/bin`.
3. **Open Claymod settings**, choose **Local agent**, open **Set up claymod-bridge** and copy the
   command. It contains your copy of Claymod's extension ID:

   ```bash
   claymod-bridge install --extension-id <id>
   ```

   Run it **in a terminal where your agent works**. The bridge remembers that terminal's `PATH`,
   because Chrome started from the Dock or a desktop launcher often has a shorter one.
4. Pick the agent and sign-in, then click **Test connection**. Chrome asks once to let Claymod
   talk to local apps (the optional `nativeMessaging` permission).
5. **Save**, and create mods as usual. The side panel shows the agent, e.g.
   `Claude Code · CLI default model (local)`.

### Sign-in modes

- **Use the CLI's own sign-in.** Claymod runs your installed CLI unchanged with your normal
  environment, so it authenticates however you set it up (`claude` login, `codex login`, …).
  Claymod never reads, stores or forwards your login or tokens. Claude Code runs with
  `--setting-sources user` so your user settings (for example an `apiKeyHelper` or Bedrock
  setup) still apply, while project settings don't.
- **Use an API key.** Paste the key in settings and click **Store in keychain**: it goes once to
  the bridge, which stores it in your system keychain (macOS Keychain, libsecret on Linux,
  Windows Credential Manager). Claymod keeps no copy. Or run `claymod-bridge keys set <agent>`.
  In this mode the agent runs with an empty home folder and a minimal environment, so it can't
  pick up your saved sign-in or settings: Claude Code with `--bare`, Codex with an empty
  `CODEX_HOME`, Gemini CLI and Antigravity with an empty `HOME`.
  If no key is stored, the bridge uses the agent's variable from its own environment
  (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `GEMINI_API_KEY`).

## Commands

| Command | What it does |
| --- | --- |
| `claymod-bridge install --extension-id <id> [--browser chrome\|chromium\|chrome-for-testing\|all]` | Registers the native messaging host for Claymod only, and saves the current `PATH` |
| `claymod-bridge doctor` | Checks the registration, the keychain, which agents are found and signed in, and which keys are saved (never prints keys) |
| `claymod-bridge keys list \| set <agent> \| delete <agent>` | Manages agent API keys in the system keychain |
| `claymod-bridge mcp` | MCP server so agents can read the page and propose mods you approve ([mcp.md](mcp.md)) |
| `claymod-bridge uninstall` | Removes the registration, the bridge settings and the saved keys |
| `claymod-bridge host` | The native messaging host; Chrome starts it, you don't |

`install` writes the host manifest, with `allowed_origins` set to exactly
`chrome-extension://<id>/`, to:

| System | Location |
| --- | --- |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/claymod.bridge.json` (Chromium and Chrome for Testing: their own folders) |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/claymod.bridge.json` (`~/.config/chromium/…`, `~/.config/google-chrome-for-testing/…`) |
| Windows | `%APPDATA%\Claymod\claymod.bridge.<browser>.json`, pointed to by `HKCU\Software\Google\Chrome\NativeMessagingHosts\claymod.bridge` (or `…\Chromium\…`) |

Settings live in `~/.config/claymod/bridge.json` (macOS: `~/Library/Application Support/Claymod`,
Windows: `%APPDATA%\Claymod`).

## Troubleshooting

| Claymod says | Do this |
| --- | --- |
| “claymod-bridge isn't set up for this browser” | Run the `install` command from settings. Using a different Chromium-based browser or profile? See below. |
| “doesn't allow this copy of Claymod” | The extension ID changed (for example a different unpacked folder). Run `install` again with the ID from settings. |
| “Couldn't find Claude Code (`claude`)” | Run `install` again from a terminal where the command works, so the bridge saves that `PATH`. |
| “… isn't signed in” | Run the CLI once in a terminal and sign in, or switch to an API key. |
| “stopped unexpectedly” / anything else | Run `claymod-bridge doctor`. |
| No system keychain (Linux without GNOME Keyring or KWallet) | Set the agent's API key variable in the environment Chrome starts with, or set `CLAYMOD_BRIDGE_NO_KEYCHAIN=1` to skip the keychain entirely. |

**Custom profiles.** On Linux and macOS, Chrome reads user-level hosts from
`<user data dir>/NativeMessagingHosts`; the locations above are those folders for the default
profile. If you start Chrome with `--user-data-dir=<dir>`, copy `claymod.bridge.json` into
`<dir>/NativeMessagingHosts/`.

**Windows.** Agents installed with npm are `.cmd` scripts, which the bridge starts through
`cmd.exe`; requests that would need unsafe quoting there are refused with a message. Native
`.exe` builds (Claude Code's installer, Codex and Antigravity releases) avoid this.

**Antigravity** takes its prompt as a command-line argument (plain stdin isn't a documented
input), so very large pages can exceed the operating system's limit; pick an element to focus on.

## Privacy and security

- The bridge sends the page snapshot only to the agent you chose. It has no telemetry, never
  calls a Claymod server, and removes `LANGSMITH_*` / `LANGCHAIN_*` tracing variables at
  startup so nothing it starts can send traces.
- Only the Claymod extension ID you installed with can start the bridge (Chrome checks
  `allowed_origins`, and the bridge checks the caller's origin again).
- Agents run with tools switched off where the CLI allows it (Claude Code `--tools ""`, no MCP
  servers), in a read-only sandbox otherwise (Codex `--sandbox read-only`, Antigravity
  `--sandbox`), in an empty temporary folder that is deleted afterwards.
- Codex can't turn its shell tool off completely; a prompt injected through page text could make
  it read files, but not write them or reach the network from its sandbox. Every mod is still
  previewed before you keep it, and generated JS only runs in Chrome's user-script sandbox.

## Testing status

Claude Code's flags and output were checked against a real `claude` (2.1.326). Codex, Gemini CLI
and Antigravity were implemented from their current official docs and are tested against fake
CLIs that follow those documented formats (`packages/bridge/tests/fixtures/fake-agent.ts`).
Please report any mismatch you see with a real CLI.

## Development

```bash
bun run --cwd packages/bridge src/cli.ts doctor        # run from source
bun run --cwd packages/bridge src/cli.ts install --extension-id <id>   # registers a launcher script
bun run bridge:compile                                 # binary for this machine
bun run --cwd packages/bridge compile:all              # macOS arm64/x64, Linux x64, Windows x64
```

Installing from source registers a small launcher script (`claymod-bridge-host`) that runs
`bun src/cli.ts`, because Chrome can't pass extra arguments to a host. Tests:
`bun test packages/bridge` (framing, runners, commands, and an integration test that starts the
host the way Chrome does against fake agents) and `tests/e2e/bridge.e2e.ts` in the extension
(the real extension and bridge over native messaging).

To add an agent: one file in `packages/bridge/src/runners/` implementing `AgentRunner`
(arguments, environment, files and output parsing; all pure), registered in
`runners/index.ts`, plus its id, label and command in `packages/core/src/bridge/protocol.ts`.
Check the vendor's current terms first.
