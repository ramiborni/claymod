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
| Pages you visit | A generated or imported mod runs malicious JS | JS runs only via `chrome.userScripts` in the isolated `USER_SCRIPT` world, only on the mod's declared `matches`, and only after you have seen it (it ran in the preview, or you opened the code). Imported mods keep JS disabled until you view the code and enable it. A per-site switch pauses every mod, CSS and JS, on a site. |
| Your browsing | The extension gets broad host access | No host access at install. The current page is read only after you click the Claymod icon (`activeTab`). Lasting access is requested per site when you keep a mod (`optional_host_permissions`). |
| Extension pages | Code injection into the extension itself | No `eval`, no remote code: everything the extension runs ships in the package. Mod code is never executed in extension pages. Only Claymod's own pages can call the background; content scripts and web pages can't. |
| Page content | Snapshots leak to third parties | Snapshots go only to the provider you configured. No telemetry, no Claymod server. |
| API keys | Keys leak or are misused | Provider keys are encrypted in `chrome.storage.local` with a non-extractable key kept in IndexedDB, and sent only to the provider they belong to. This protects copies of the storage (backups, synced or copied profiles), not against malware running as you. Local-agent keys are stored by `claymod-bridge` in the OS keychain and never reach the extension. |
| Vendor accounts | Claymod handles your AI subscription login | Claymod never shows a vendor login and never reads, stores or forwards credentials or session tokens. Local agents run your installed CLI unchanged, with your own sign-in or API key ([ADR 0004](docs/decisions/0004-local-agents.md)). Google's CLIs default to an API key, with a warning about Google's account-suspension policy before using their sign-in. |
| Local machine | A website or another app drives the bridge | The native messaging host only accepts the Claymod extension ID (`allowed_origins`, checked again by the bridge), and `nativeMessaging` is requested only when you choose a local agent. Agents run headless in an empty temporary folder with tools off or a read-only sandbox, with a timeout, and are stopped when Chrome disconnects. API-key mode gives them a minimal environment and an empty home. The bridge clears `LANGSMITH_*` / `LANGCHAIN_*` variables and has no telemetry. Codex can't disable its shell tool, so injected page text could make it read (not write) files; every mod is still previewed before it's kept. Agents (MCP) are off until you switch them on; the host then listens on a user-only socket (0600 in a 0700 folder, or a per-user named pipe on Windows) and every call needs a random token regenerated on each connection. There is no network port. `preview_mod` and `save_mod` need your approval in the side panel and go through the normal preview, site-access and JavaScript review; tool arguments and mods are validated by the extension. |
| On-device models | Downloaded model code or data is tampered with | Model libraries (code) ship inside the extension, verified against pinned hashes at build time. Weights come from a pinned Hugging Face commit; WebLLM checks config and tokenizer files against pinned SRI hashes. Nothing is sent anywhere after the download. |
| Prompt injection | Page text tells the model to write a harmful mod | Model output is validated against the mod schema; you preview every mod before it is kept; JS stays sandboxed as above. |

Out of scope: a compromised browser or OS, and mods you knowingly write or enable yourself.
