import { createProvider, type ModelProvider, type ProviderConfig } from "@claymod/core";
import { getProviderConfig } from "@/lib/storage";

export const NOT_CONFIGURED =
  "Set up a model provider first: open Claymod settings, choose a provider and save.";

/** chrome-extension://<id>, shown in the Ollama OLLAMA_ORIGINS hint. */
export const extensionOrigin = () => browser.runtime.getURL("").replace(/\/$/, "");

export function providerFor(config: ProviderConfig): ModelProvider {
  return createProvider(config, { extensionOrigin: extensionOrigin() });
}

export async function configuredProvider(): Promise<
  { config: ProviderConfig; provider: ModelProvider } | undefined
> {
  const config = await getProviderConfig();
  return config && { config, provider: providerFor(config) };
}

export function providerLabel(config: ProviderConfig): string {
  const model = config.model ?? "default model";
  return config.kind === "anthropic"
    ? `Anthropic · ${model}`
    : `${new URL(config.baseUrl).host} · ${model}`;
}
