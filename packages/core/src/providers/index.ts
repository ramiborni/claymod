import { createAnthropicProvider } from "./anthropic";
import type { ProviderConfig } from "./config";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { FetchLike, ModelProvider } from "./types";

export interface ProviderContext {
  fetch?: FetchLike;
  extensionOrigin?: string;
}

/** The one place providers are registered. Add new kinds here and in config.ts. */
export function createProvider(
  config: ProviderConfig,
  context: ProviderContext = {},
): ModelProvider {
  switch (config.kind) {
    case "openai-compatible":
      return createOpenAICompatibleProvider({ ...config, ...context });
    case "anthropic":
      return createAnthropicProvider({ ...config, ...context });
  }
}
