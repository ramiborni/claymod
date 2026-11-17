# Agents drive Claymod (MCP)

`claymod-bridge mcp` is an [MCP](https://modelcontextprotocol.io) server. With it, an AI agent you
already use (Claude Code, Codex, OpenCode, or any MCP client) can read the page you have open in
Chrome, see your mods, and **propose** mods. Nothing changes until you approve it in Claymod's
side panel.

```text
agent ──stdio──► claymod-bridge mcp ──user-only socket + token──► claymod-bridge (native host)
                                                                      │ native messaging
                                                                      ▼
                                                       Claymod background ──► side panel: you approve
```

## Tools

| Tool | What it does | Needs your approval |
| --- | --- | --- |
| `get_active_page` | URL, title and DOM outline of your active tab | No (only pages Claymod can already read) |
| `list_mods` | Your mods (id, name, sites, enabled, health), optionally for one site | No |
| `get_mod_status` | One mod's code, enabled state and health (last check results) | No |
| `preview_mod` | Shows a request card in the side panel; **Preview** applies it to that tab only | Yes |
| `save_mod` | Request card → preview → **Keep** (or **Save new version** with `replaces`) | Yes |

The server's instructions give the agent Claymod's mod rules and JSON Schema. Mods from agents
are validated exactly like model-written ones; an invalid mod comes back to the agent with the
issues to fix. Saved mods record `createdBy: { provider: "mcp:<agent name>", model: "agent" }`.

`get_active_page` can read a page after you click the Claymod icon on it, or on sites where you
kept a mod (Claymod has no access to other sites). Otherwise it tells the agent to ask you to.

## Set up

1. Install and register `claymod-bridge` (see [bridge.md](bridge.md)).
2. In Claymod settings, turn on **Let agents use Claymod (MCP)** (Chrome asks once to allow
   local apps). The status line says “Agents can reach Claymod”.
3. Add the server to your agent:

   **Claude Code**

   ```bash
   claude mcp add claymod -- claymod-bridge mcp
   ```

   **Codex**

   ```bash
   codex mcp add claymod -- claymod-bridge mcp
   ```

   Codex stops waiting for a tool after 60 seconds by default; give yourself time to approve in
   `~/.codex/config.toml`:

   ```toml
   [mcp_servers.claymod]
   command = "claymod-bridge"
   args = ["mcp"]
   tool_timeout_sec = 180
   ```

   **OpenCode** (`opencode.json` or `opencode.jsonc`)

   ```json
   {
     "mcp": {
       "servers": {
         "claymod": { "type": "local", "command": ["claymod-bridge", "mcp"] }
       }
     }
   }
   ```

   Use the full path to `claymod-bridge` if it isn't on the agent's `PATH`.
4. Keep Chrome open with the Claymod side panel available (click the toolbar icon).

## Try it (manual demo)

1. Open a page, for example a news site, and click the Claymod icon so the side panel opens.
2. Ask your agent: “Use Claymod to hide the cookie banner on the page I have open.”
3. The agent calls `get_active_page`, writes a mod and calls `preview_mod`. A card appears in the
   side panel: “claude-code wants to preview a mod”. Click **Preview**: the page changes on this
   tab only, and the agent is told you're previewing.
4. The agent calls `save_mod`. Click **Preview** on the new card, check the code with
   **View code**, then **Keep**. Chrome asks for access to that site; the agent gets the saved
   mod's id and version.
5. Later, ask: “Is my Claymod cookie-banner mod still healthy?” (`get_mod_status`).

Declining a card, discarding the preview, or waiting more than about three minutes answers the
agent too, so it never hangs.

## How it's protected

- **Off by default.** The switch keeps one `claymod-bridge` process connected while it's on
  (an open native messaging port keeps Chrome's service worker alive). Turning it off closes it.
- **Only you, only this machine.** The host listens on a Unix socket in Claymod's settings folder
  (`~/.config/claymod/mcp.sock`, macOS `~/Library/Application Support/Claymod/mcp.sock`; folder
  mode 0700, socket 0600) or a per-user named pipe on Windows, and every call must carry a random
  token from `mcp-token` (mode 0600), regenerated whenever Chrome reconnects. There is no network
  port.
- **You approve every change.** `preview_mod` and `save_mod` wait for you in the side panel, then
  go through the same preview, site-access request and JavaScript review as any other mod.
- **Arguments are untrusted.** Tool arguments and mods are validated in the extension; agents
  can't call anything else.

## Troubleshooting

| The agent sees | Do this |
| --- | --- |
| “Claymod isn't accepting agents right now” | Turn on the switch in Claymod settings and keep Chrome open. `claymod-bridge doctor` shows “Agents (MCP): Claymod is listening”. |
| “Claymod can't read the active tab” | Click the Claymod icon on that page, then try again. |
| “The user didn't answer in time” | Open the side panel (Claymod icon) before asking the agent for a preview or save. |
| Codex times out at 60 s | Set `tool_timeout_sec = 180` as above. |
| Settings show a bridge error | See [bridge.md](bridge.md#troubleshooting). |

If you use Claymod in two Chrome profiles at once, the profile that connected last receives agent
calls.
