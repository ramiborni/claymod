# Screenshots

Captured from the real extension with a fake model and a synthetic page. Since M7 every
screenshot shows the current UI (layout G, "Framed sheet" look); the section names say which
milestone added the screen.
Regenerate with `SCREENSHOTS_DIR=$PWD/docs/screenshots bun run --cwd packages/extension screenshots`.

| | Light | Dark |
| --- | --- | --- |
| Picking an element | ![](light-0-together-picking.png) | ![](dark-0-together-picking.png) |
| Preview (promoted posts hidden) | ![](light-0-together-preview.png) | ![](dark-0-together-preview.png) |
| Compose | ![](light-1-panel-compose.png) | ![](dark-1-panel-compose.png) |
| Picked | ![](light-4-panel-picked.png) | ![](dark-4-panel-picked.png) |
| Generating | ![](light-5-panel-generating.png) | ![](dark-5-panel-generating.png) |
| Preview with code | ![](light-6-panel-preview.png) | ![](dark-6-panel-preview.png) |
| Saved | ![](light-8-panel-saved.png) | ![](dark-8-panel-saved.png) |
| Error | ![](light-9-panel-error.png) | ![](dark-9-panel-error.png) |
| Settings | ![](light-10-options.png) | ![](dark-10-options.png) |

## Local agents (M4)

Captured with the real `claymod-bridge` and a fake agent CLI.

| | Light | Dark |
| --- | --- | --- |
| Local agent connected (setup steps open) | ![](light-m4-1-local-agent-connected.png) | ![](dark-m4-1-local-agent-connected.png) |
| API key mode (key goes to the keychain) | ![](light-m4-2-agent-api-key.png) | ![](dark-m4-2-agent-api-key.png) |
| Google CLI sign-in warning | ![](light-m4-3-google-sign-in-warning.png) | ![](dark-m4-3-google-sign-in-warning.png) |
| Preview made by a local agent | ![](light-m4-4-panel-preview-local-agent.png) | ![](dark-m4-4-panel-preview-local-agent.png) |
| Bridge not installed | ![](light-m4-5-bridge-missing.png) | ![](dark-m4-5-bridge-missing.png) |

## On-device models (M6)

Headless Chrome has no WebGPU, so these use a faked GPU (a dedicated card, then an integrated one).

| | Light | Dark |
| --- | --- | --- |
| Dedicated GPU: 3B suggested | ![](light-m6-1-on-device-dedicated.png) | ![](dark-m6-1-on-device-dedicated.png) |
| Integrated GPU, choosing a heavier model | ![](light-m6-2-on-device-integrated-heavy.png) | ![](dark-m6-2-on-device-integrated-heavy.png) |

## Agents over MCP (M5)

Captured with a real MCP client, `claymod-bridge mcp` and the real bridge.

| | Light | Dark |
| --- | --- | --- |
| Settings: agents switched on | ![](light-m5-1-settings-agents.png) | ![](dark-m5-1-settings-agents.png) |
| An agent asks to save a mod | ![](light-m5-2-panel-agent-request.png) | ![](dark-m5-2-panel-agent-request.png) |
| Previewing the agent's mod | ![](light-m5-3-panel-agent-preview.png) | ![](dark-m5-3-panel-agent-preview.png) |

## Mod manager (M3)

| | Light | Dark |
| --- | --- | --- |
| Mods on this site (healthy, needs repair, JS needs review) | ![](light-m3-1-manager.png) | ![](dark-m3-1-manager.png) |
| Reviewing imported JavaScript | ![](light-m3-2-js-review.png) | ![](dark-m3-2-js-review.png) |
| Repairing | ![](light-m3-3-repairing.png) | ![](dark-m3-3-repairing.png) |
| Repair preview | ![](light-m3-4-repair-preview.png) | ![](dark-m3-4-repair-preview.png) |
| Repaired | ![](light-m3-5-repaired.png) | ![](dark-m3-5-repaired.png) |
| Site paused | ![](light-m3-6-site-paused.png) | ![](dark-m3-6-site-paused.png) |
