import { createAnthropicProvider } from "./anthropic";
import type { ProviderConfig } from "./config";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import type { ModelProvider, ProviderRuntime } from "./types";

export interface ProviderContext extends ProviderRuntime {
  extensionOrigin?: string | undefined;
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
