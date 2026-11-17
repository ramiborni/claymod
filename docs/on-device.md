# On-device models (WebLLM)

Claymod can write mods with a small model that runs **on your computer's GPU**, through
[WebLLM](https://github.com/mlc-ai/web-llm) and Chrome's WebGPU. No API key, no account, and after
a one-time download nothing leaves your device. Smaller models write simpler mods than cloud
models; they are best for clear, single changes ("hide the sidebar", "make the text bigger").

## Models

| Model | GPU memory while it runs* | Download |
| --- | --- | --- |
| Qwen2.5 Coder 1.5B | ≈ 1.8 GB | 0.9 GB |
| Qwen2.5 Coder 3B | ≈ 2.7 GB | 1.7 GB |
| Qwen2.5 Coder 7B | ≈ 5.4 GB | 4.3 GB |

\* With Claymod's 10,240-token context. GPUs without WebGPU's `shader-f16` feature get the
"any GPU" builds of 1.5B and 3B, which need more memory.

### How Claymod picks one for you

WebGPU doesn't tell a page how much memory the GPU has, so Claymod estimates conservatively:

- **Integrated GPUs** (Intel, AMD APUs, mobile): half of system memory (Chrome reports at most 8 GB).
- **Apple GPUs**: 65% of system memory (unified memory).
- **Dedicated GPUs** (NVIDIA, AMD): 6 GB, a typical mid-range card.

It then **suggests the largest model that fits in half of that estimate**, so your other apps,
tabs and the desktop keep the rest. Bigger models stay selectable, labelled "may slow your other
apps" (up to 80% of the estimate) or "likely too large for this GPU". If Chrome has no usable GPU
(WebGPU off, or only the slow software fallback), Claymod says so and suggests another provider.

The model is loaded when you first generate and **unloaded after 3 idle minutes**, giving the
GPU memory back.

## Set up

1. Claymod settings → Provider → **On this device (WebLLM)**.
2. Check the suggestion, pick a model, click **Download** (one time; progress is shown).
3. **Save**, then create mods as usual. The side panel shows e.g.
   `Qwen2.5 Coder 3B (on this device)`.

Generating never starts a download by surprise: if the model isn't downloaded, the side panel
tells you to download it in settings. **Delete download** frees the disk space.

## What's downloaded, and from where

- **Code** (the compiled WebAssembly model libraries, about 6 MB each) ships **inside the
  extension**; nothing executable is fetched at runtime. The build fetches them once from
  [mlc-ai/binary-mlc-llm-libs](https://github.com/mlc-ai/binary-mlc-llm-libs) and checks each
  against a SHA-256 hash pinned in `packages/core/src/providers/on-device-models.ts`
  (`scripts/webllm-libs.ts`; a mismatch fails the build).
- **Weights** (data) come from Hugging Face at a **pinned commit** of each `mlc-ai/…-MLC`
  repository, so they can't change under you. WebLLM also checks the model config and tokenizer
  files against pinned SRI hashes and refuses files that don't match.
- Files are cached by Chrome for the extension (Cache Storage); Claymod's page snapshots are
  never sent anywhere.

## Limits

- **Page size.** These models have small context windows, so Claymod sends a shorter page
  outline (10 KB instead of about 30 KB). Picking the element you mean helps a lot.
- **Speed.** The first generation after loading is the slowest; expect seconds to a minute
  depending on the GPU and model.
- **GPU support.** WebGPU is on by default in Chrome on Windows, macOS and ChromeOS; on Linux it
  depends on the GPU and Chrome version. Where `navigator.gpu` has no adapter, on-device models
  can't run.
- **Bundle size.** WebLLM adds about 6 MB to Claymod's background script and the model
  libraries about 31 MB to the extension.

## Manual check (CI has no GPU)

The automated tests cover the catalog and hashes, the suggestion logic, the provider, the
settings states (with a faked GPU) and the real service worker refusing to start a download.
Real inference needs a GPU that Chrome exposes, so it's a manual check:

1. Load the extension (`bun dev`) in Chrome on a machine where `chrome://gpu` shows WebGPU
   "Hardware accelerated".
2. Settings → On this device → keep the suggested model → **Download** → **Test connection**:
   "Connected. Qwen2.5 Coder … answered."
3. Open a simple page, ask "Hide the sidebar", **Generate**: a preview appears.
4. Wait 3 minutes, check `chrome://gpu` or your OS's GPU monitor: memory is released.
