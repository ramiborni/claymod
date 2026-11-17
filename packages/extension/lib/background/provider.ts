import {
  AGENT_LABELS,
  createProvider,
  type ModelProvider,
  type ProviderConfig,
} from "@claymod/core";
import { getProviderConfig } from "@/lib/storage";
import { nativeBridge } from "./bridge";

export const NOT_CONFIGURED =
  "Set up a model provider first: open Claymod settings, choose a provider and save.";

/** chrome-extension://<id>, shown in the Ollama OLLAMA_ORIGINS hint. */
export const extensionOrigin = () => browser.runtime.getURL("").replace(/\/$/, "");

export function providerFor(config: ProviderConfig): ModelProvider {
  return createProvider(config, { extensionOrigin: extensionOrigin(), bridge: nativeBridge });
}

export async function configuredProvider(): Promise<
  { config: ProviderConfig; provider: ModelProvider } | undefined
> {
  const config = await getProviderConfig();
  return config && { config, provider: providerFor(config) };
}

/** Recorded in a mod's createdBy.provider. */
export function providerName(config: ProviderConfig): string {
  return config.kind === "local-agent" ? `local-agent:${config.agent}` : config.kind;
}

export function providerLabel(config: ProviderConfig): string {
  if (config.kind === "local-agent") {
    return `${AGENT_LABELS[config.agent]} · ${config.model ?? "CLI default model"} (local)`;
  }
  const model = config.model ?? "default model";
  return config.kind === "anthropic"
    ? `Anthropic · ${model}`
    : `${new URL(config.baseUrl).host} · ${model}`;
}
