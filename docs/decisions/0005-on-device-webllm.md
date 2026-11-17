# 0005. On-device models with WebLLM

- Status: accepted
- Date: 2026-11-17

## Context

Some users want Claymod without any API key, account or local server. WebLLM runs quantised
models on the GPU through WebGPU, including inside an MV3 service worker (Chrome 124+). By
default it downloads each model's compiled WebAssembly library from GitHub at runtime, which
CLAUDE.md forbids ("never fetch code at runtime"), and it doesn't know how much GPU memory the
user can spare.

## Decision

- **Provider `on-device`** with a short curated list (Qwen2.5 Coder 1.5B / 3B / 7B, plus
  `q4f32` builds of 1.5B and 3B for GPUs without `shader-f16`). Core holds the catalog, the
  provider (with an injected engine, so core stays free of browser APIs) and the suggestion
  logic; the extension runs `MLCEngine` in the background service worker.
- **No runtime code.** The five model libraries ship in the extension. The build fetches them
  and checks pinned SHA-256 hashes (`scripts/webllm-libs.ts`); they are not committed to git.
  Weights are pinned to a Hugging Face commit, and WebLLM verifies config and tokenizer files
  against pinned SRI hashes. The default MV3 CSP already allows `'wasm-unsafe-eval'`.
- **GPU-aware suggestions that leave headroom.** WebGPU exposes no memory size, so Claymod
  estimates it (integrated: 50% of system memory; Apple: 65%; dedicated: 6 GB) and suggests the
  largest model needing at most half of the estimate. Larger models stay selectable with clear
  warnings. The engine unloads after 3 idle minutes to give memory back.
- **No surprise downloads.** Downloads start only from the settings page's Download button;
  generating without a downloaded model explains how to get it.
- **Smaller prompts.** A 10,240-token context (above WebLLM's 4,096 default) and a 10 KB page
  outline budget (`PromptBudget`), with JSON-schema-constrained output and the usual retry.
- **No new permission.** The engine runs in the service worker; pages keep it alive during long
  operations with the existing RPC heartbeat.

## Consequences

- The extension grows by about 37 MB (31 MB of libraries, about 6 MB of WebLLM in the
  background script), and the service worker parses a larger script when it wakes. If that
  shows up in practice, move the engine to an offscreen document (needs the `offscreen`
  permission).
- Updating WebLLM or a model means updating the pinned hashes and revisions in
  `on-device-models.ts`; a mismatch fails the build or the download instead of running
  unverified code.
- CI has no GPU: real inference is a documented manual check (docs/on-device.md).
