# 0003. LangChain JS for models, LangGraph JS for orchestration

- Status: accepted (supersedes [0002](0002-fetch-based-providers.md))
- Date: 2026-11-17

## Context

Claymod calls models to create and repair mods, and will grow more providers and multi-step flows
(repair, local agents, MCP). We want one well-known abstraction for chat models and an explicit,
inspectable orchestration layer instead of hand-written loops.

## Decision

- Model calls go through LangChain JS chat models, wrapped as Claymod `ModelProvider`s:
  - `openai-compatible` → `ChatOpenAICompletions` from `@langchain/openai`. Not `ChatOpenAI`,
    which switches some models to the Responses API that Ollama and LM Studio don't serve.
    JSON is requested with `withStructuredOutput(..., { method: "jsonMode" | "jsonSchema" })`.
  - `anthropic` → `ChatAnthropic` from `@langchain/anthropic`, with
    `withStructuredOutput(..., { method: "jsonSchema" })`, which sends `output_config.format`.
    The default `functionCalling` method forces a tool call, which current Claude models reject.
    The bundled Anthropic SDK sets the direct-browser-access header for CORS.
- `withStructuredOutput` is used with `includeRaw: true`: Claymod reads the raw text and validates
  it with its own Zod schema, so invalid answers can be fed back verbatim.
- The create/repair pipeline is a LangGraph `StateGraph`:
  `callModel → validate → (END | addFeedback → callModel)`, at most two model calls.
  It is imported from `@langchain/langgraph/web` so it runs in an MV3 service worker.
- Prompts stay plain data (`{ system, messages }`); they are converted to LangChain messages at
  the provider edge, so the bridge and tests don't depend on LangChain types.
- Packages are pinned to exact versions: `@langchain/core`, `@langchain/langgraph`,
  `@langchain/anthropic`, `@langchain/openai`.

## Consequences

- Adding a provider means wrapping an existing `@langchain/*` integration.
- Bundle size grows: core bundles to about 2 MB minified (about 500 KB gzipped) for the browser,
  mostly the vendor SDKs. That is acceptable for a locally installed extension; revisit with
  code-splitting per provider if it becomes a problem.
- LangChain retries 429 / 5xx / network errors with backoff (we use 2 retries).
- **Telemetry:** LangChain only sends traces to LangSmith when tracing environment variables are
  set. Browsers have none. The bridge (M4) must clear `LANGSMITH_*` / `LANGCHAIN_*` tracing
  variables at startup so a user's shell settings can't turn tracing on.
- Zod probes whether `new Function` is allowed; under the extension CSP it isn't, and Zod falls
  back to its non-JIT path. Set `z.config({ jitless: true })` in extension entrypoints to skip
  the probe.
- Upgrades must re-check the request shapes; the provider tests assert the exact requests sent.
