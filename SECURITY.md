# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through
[GitHub private vulnerability reporting](https://github.com/ramiborni/claymod/security/advisories/new).
Do not open a public issue. Include steps to reproduce and the impact you expect.

We aim to acknowledge reports within 3 working days and to agree a disclosure timeline with you.
Only the latest release is supported.

## Threat model (short)

Claymod runs AI-written code on the websites you visit, so most of our design is about containing
that code.

| Asset | Threat | Mitigation |
| --- | --- | --- |
| Pages you visit | A generated or imported mod runs malicious JS | JS runs only via `chrome.userScripts` in the isolated `USER_SCRIPT` world, only on the mod's declared `matches`, and only after you preview it. Imported mods keep JS disabled until you view the code and enable it. |
| Your browsing | The extension gets broad host access | No host access at install. The current page is read only after you click the Claymod icon (`activeTab`). Lasting access is requested per site when you keep a mod (`optional_host_permissions`). |
| Extension pages | Code injection into the extension itself | No `eval`, no remote code: everything the extension runs ships in the package. Mod code is never executed in extension pages. Only Claymod's own pages can call the background; content scripts and web pages can't. |
| Page content | Snapshots leak to third parties | Snapshots go only to the provider you configured. No telemetry, no Claymod server. |
| API keys | Keys leak or are misused | Keys stay in `chrome.storage.local` and are sent only to the provider they belong to. |
| Local machine | A website or another app drives the bridge | The native messaging host only accepts the Claymod extension ID (`allowed_origins`). The MCP socket is user-only and needs a random token from `~/.claymod/`. Saving or previewing a mod through MCP needs your confirmation in the side panel. |
| Prompt injection | Page text tells the model to write a harmful mod | Model output is validated against the mod schema; you preview every mod before it is kept; JS stays sandboxed as above. |

Out of scope: a compromised browser or OS, and mods you knowingly write or enable yourself.
