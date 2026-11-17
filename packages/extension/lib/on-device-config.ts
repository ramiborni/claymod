import {
  ON_DEVICE_CONTEXT_TOKENS,
  ON_DEVICE_MODELS,
  vramNeededMB,
  weightsUrl,
} from "@claymod/core/on-device";
import type { AppConfig } from "@mlc-ai/web-llm";

/** Where scripts/webllm-libs.ts puts the libraries inside the extension. */
export const LIB_DIR = "webllm";

/**
 * WebLLM's model list for Claymod's curated models: libraries from the extension package,
 * weights at a pinned Hugging Face commit, and every code/config/tokenizer file SRI-checked.
 */
export function onDeviceAppConfig(libUrl: (file: string) => string): AppConfig {
  return {
    model_list: ON_DEVICE_MODELS.map((model) => ({
      model: weightsUrl(model),
      model_id: model.id,
      model_lib: libUrl(`${LIB_DIR}/${model.lib.file}`),
      vram_required_MB: vramNeededMB(model),
      low_resource_required: false,
      ...(model.precision === "f16" ? { required_features: ["shader-f16"] } : {}),
      overrides: { context_window_size: ON_DEVICE_CONTEXT_TOKENS },
      integrity: {
        config: model.integrity.config,
        model_lib: model.lib.integrity,
        tokenizer: model.integrity.tokenizer,
        onFailure: "error",
      },
    })),
  };
}

/** WebLLM and WebGPU report failures as free text; each maps to what the user can do. */
export function onDeviceErrorMessage(raw: string): string {
  if (/integrity/i.test(raw)) {
    return "The downloaded model files didn't match what Claymod expects, so they weren't used. Delete the download in Claymod settings and try again.";
  }
  if (/out of memory|oom|device (was )?lost|exceed|allocation/i.test(raw)) {
    return "Your GPU ran out of memory. Pick a smaller model in Claymod settings, or close other GPU-heavy tabs and apps.";
  }
  if (/shader-f16|feature|adapter|webgpu|gpu/i.test(raw)) {
    return "Chrome can't run this model on your GPU. Pick a model marked “any GPU” in Claymod settings, or choose another provider.";
  }
  if (/fetch|network|failed to load|download/i.test(raw)) {
    return "Couldn't download the model. Check your connection and try again.";
  }
  return `The on-device model failed (${raw.slice(0, 200)}). Try again, or pick a smaller model.`;
}
