# 0004. Local agents through claymod-bridge, and how they sign in

- Status: accepted
- Date: 2026-11-17

## Context

People who already use an agent CLI (Claude Code, Codex, Gemini CLI, Antigravity CLI) want
Claymod to use it instead of a separate API key in the browser. A browser extension can't start
programs, so Chrome native messaging and a small local program, `claymod-bridge`, connect the two.

Each vendor has rules about third-party use of its sign-in. As of this date:

- **Anthropic** ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)):
  third parties may not offer Claude.ai login, route requests through subscription credentials
  on users' behalf, or "collect, store, or intermediate Claude.ai credentials or session tokens".
  This "does not prevent an end user from signing in to the unmodified Claude Code binary with
  their own Claude subscription". Products that run Claude Code may not remove, disable or
  restrict its built-in authentication methods.
- **OpenAI** ([Codex auth](https://learn.chatgpt.com/docs/auth)): `codex exec` uses the CLI's
  saved sign-in by default; API keys are recommended for programmatic use. Nothing addresses a
  local tool running the user's own CLI.
- **Google** ([Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)):
  "using third-party software, tools, or services to harvest or piggyback on Gemini CLI's OAuth
  authentication" violates its terms and may lead to suspension; Google recommends an API key or
  Vertex AI for third-party tools, and has suspended accounts in waves (most recently
  2026-11-06). Running the official CLI as a subprocess isn't addressed.

## Decision

- **The bridge runs the agent; the extension stays the brain.** The bridge receives the prompt
  and JSON Schema, runs the agent once and returns its raw answer. Validation, the retry and the
  preview stay in the extension (`createLocalAgentProvider` in core), exactly as for API
  providers. The bridge doesn't use LangChain, so ADR 0003's LangChain notes don't apply to it;
  it still clears `LANGSMITH_*` / `LANGCHAIN_*` variables.
- **Two auth modes per agent**, chosen by the user:
  - *CLI sign-in*: the unmodified, installed CLI runs with the user's environment and
    authenticates however the user set it up. Claymod never reads, stores or forwards
    credentials or tokens, and never shows a vendor login.
  - *API key*: the key is stored by the bridge in the OS keychain (`Bun.secrets`), never in the
    extension, and the agent runs with an empty home and a minimal environment so no saved
    sign-in is used (Claude Code `--bare`, isolated `CODEX_HOME`, empty `HOME` for Google's CLIs).
- **Defaults follow the vendors' terms**: CLI sign-in for Claude Code and Codex; API key for
  Gemini CLI and Antigravity, whose CLI sign-in needs an explicit "I understand the risk" after a
  warning that names the suspension risk and links Google's FAQ.
- **Least privilege for the agent**: headless, no tools where the CLI allows it, otherwise a
  read-only sandbox; an empty temporary working folder; no saved session; a timeout; killed when
  Chrome closes the port.
- **Native messaging hardening**: `allowed_origins` lists only the installed extension ID, the
  host re-checks the caller's origin, the framing caps messages at Chrome's limits (1 MiB out,
  64 MiB in), and `nativeMessaging` is an optional permission requested from settings.
- **Direct-provider keys are encrypted at rest** in the extension with a non-extractable AES-GCM
  key kept in IndexedDB. This protects copies of `chrome.storage` (backups, profile copies), not
  against malware running as the user; SECURITY.md says so.

## Consequences

- CLAUDE.md's vendor-terms rule now covers local agents (no vendor login, no credential handling,
  the user's own unmodified CLI or API key). Each new agent needs a terms check first.
- Agent CLIs change their flags; Claude Code was verified against a real CLI, the others against
  their documentation and fake binaries. Runners are one file each and fully unit-tested, so
  fixes stay small.
- Users need a terminal once (`claymod-bridge install`); settings show the exact command with
  their extension ID, and every error maps to a next step.
- Compiled bridges are large (about 90–120 MB) because they embed the Bun runtime.
