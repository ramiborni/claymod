import {
  AGENT_LABELS,
  createProvider,
  type ModelProvider,
  ON_DEVICE_OUTLINE_BYTES,
  onDeviceModel,
  type PromptBudget,
  type ProviderConfig,
} from "@claymod/core";
import { getProviderConfig } from "@/lib/storage";
import { nativeBridge } from "./bridge";
import { onDeviceEngine } from "./on-device-engine";

export const NOT_CONFIGURED =
  "Set up a model provider first: open Claymod settings, choose a provider and save.";

/** chrome-extension://<id>, shown in the Ollama OLLAMA_ORIGINS hint. */
export const extensionOrigin = () => browser.runtime.getURL("").replace(/\/$/, "");

export function providerFor(config: ProviderConfig): ModelProvider {
  return createProvider(config, {
    extensionOrigin: extensionOrigin(),
    bridge: nativeBridge,
    onDevice: onDeviceEngine,
  });
}

/** On-device models have small context windows, so they get a shorter page outline. */
export function promptBudget(config: ProviderConfig): PromptBudget | undefined {
  return config.kind === "on-device" ? { outlineBytes: ON_DEVICE_OUTLINE_BYTES } : undefined;
}

export async function configuredProvider(): Promise<
  { config: ProviderConfig; provider: ModelProvider } | undefined
> {
  const config = await getProviderConfig();
  return config && { config, provider: providerFor(config) };
}

/** Recorded in a mod's createdBy.provider. */
export function providerName(config: ProviderConfig): string {
  if (config.kind === "local-agent") return `local-agent:${config.agent}`;
  return config.kind === "on-device" ? `on-device:webllm` : config.kind;
}

export function providerLabel(config: ProviderConfig): string {
  if (config.kind === "local-agent") {
    return `${AGENT_LABELS[config.agent]} · ${config.model ?? "CLI default model"} (local)`;
  }
  if (config.kind === "on-device") {
    return `${onDeviceModel(config.model)?.label ?? config.model} (on this device)`;
  }
  const model = config.model ?? "default model";
  return config.kind === "anthropic"
    ? `Anthropic · ${model}`
    : `${new URL(config.baseUrl).host} · ${model}`;
}
