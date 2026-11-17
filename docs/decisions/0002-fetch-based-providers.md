# 0002. Fetch-based model providers, no vendor SDKs

- Status: superseded by [0003](0003-langchain-and-langgraph.md)
- Date: 2026-11-17

## Context

`packages/core` must run in the extension's service worker, in the bridge and in tests, with no
browser or Node APIs. Vendor SDKs add weight, assume a runtime, and (for browsers) need an
explicit opt-in to run client-side anyway.

## Decision

- Each provider is one file that calls the vendor's HTTP API with an injected `fetch`.
- `openai-compatible` covers Ollama, LM Studio, OpenRouter and OpenAI via a base URL. It asks for
  JSON with `response_format` (`json_object` by default; `json_schema` or none are settings,
  because support differs between servers).
- `anthropic` calls the Messages API (`anthropic-version: 2026-10-21`) from the browser with the
  user's own key and the `anthropic-dangerous-direct-browser-access` header, which the API
  requires for CORS. It asks for structured output with the mod draft schema, after removing
  keywords the API rejects (`minLength`, `pattern`, …). Zod re-checks everything afterwards.
- Whatever the provider, the answer goes through the same parse → validate → one retry pipeline.

## Consequences

- No SDK dependencies; adapters are small and easy to review.
- We track API changes ourselves. Recorded responses in `packages/core/tests/recordings/` pin the
  shapes we rely on; replace the hand-written ones with real recordings when possible.
- Organisations that disallow direct browser access (for example some zero-data-retention
  setups) can't use the `anthropic` provider from the extension; the bridge (M4) is the fallback.
