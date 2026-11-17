import { err, ok, type Result } from "../result";
import { onDeviceModel } from "./on-device-models";
import type { ModelProvider, ProviderError } from "./types";

export interface OnDeviceRequest {
  modelId: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  /** JSON Schema as a string: WebLLM constrains the output to it with a grammar. */
  jsonSchema?: string | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Runs a model on this device. The extension implements it with WebLLM (WebGPU) in the
 * background; core stays free of browser APIs. Errors must already say what to do next.
 */
export type OnDeviceEngine = (request: OnDeviceRequest) => Promise<Result<string, ProviderError>>;

export interface OnDeviceConfig {
  model: string;
  engine?: OnDeviceEngine | undefined;
}

const NO_ENGINE: ProviderError = {
  kind: "network",
  message: "On-device models run only inside the Claymod extension. Choose another provider here.",
};

/** A curated WebLLM model running on the user's GPU: no key, no server. */
export function createOnDeviceProvider(config: OnDeviceConfig): ModelProvider {
  const model = onDeviceModel(config.model);
  return {
    id: "on-device",
    model: config.model,
    async complete(request) {
      if (!model) {
        return err({
          kind: "not-found",
          message:
            "This on-device model isn't available any more. Pick another one in Claymod settings.",
        });
      }
      if (!config.engine) return err(NO_ENGINE);
      const result = await config.engine({
        modelId: model.id,
        messages: [{ role: "system", content: request.system }, ...request.messages],
        jsonSchema: request.responseSchema ? JSON.stringify(request.responseSchema) : undefined,
        signal: request.signal,
      });
      return result.ok ? ok({ text: result.value, model: model.label }) : result;
    },
  };
}
