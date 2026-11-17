import { ChatAnthropic } from "@langchain/anthropic";
import type { AIMessage } from "@langchain/core/messages";
import { completeWithLangChain } from "./complete";
import { ANTHROPIC_DEFAULT_MODEL } from "./config";
import { toProviderError } from "./errors";
import type { ModelProvider, ProviderError, ProviderRuntime } from "./types";

export { ANTHROPIC_DEFAULT_MODEL } from "./config";
export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
const MAX_TOKENS = 16_000;
const NAME = "Anthropic";

export interface AnthropicConfig extends ProviderRuntime {
  apiKey: string;
  model?: string | undefined;
  baseUrl?: string | undefined;
  /** Ask the API to enforce the mod JSON Schema (structured outputs). */
  structuredOutput?: boolean | undefined;
}

function checkFinish(message: AIMessage): ProviderError | undefined {
  const stopReason = message.response_metadata.stop_reason;
  if (stopReason === "refusal") {
    return {
      kind: "refused",
      message: "The model declined this request. Rephrase what you want to change and try again.",
    };
  }
  if (stopReason === "max_tokens") {
    return {
      kind: "truncated",
      message: "The model's answer was cut off. Ask for a smaller change and try again.",
    };
  }
  return undefined;
}

/**
 * Claude via LangChain's ChatAnthropic, called from the browser with the user's own key.
 * The SDK sends the direct-browser-access header that the API needs for CORS.
 */
export function createAnthropicProvider(config: AnthropicConfig): ModelProvider {
  const model = config.model || ANTHROPIC_DEFAULT_MODEL;
  const baseUrl = (config.baseUrl || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const chatModel = new ChatAnthropic({
    model,
    apiKey: config.apiKey,
    anthropicApiUrl: baseUrl,
    maxTokens: MAX_TOKENS,
    maxRetries: config.maxRetries ?? 2,
    ...(config.fetch ? { clientOptions: { fetch: config.fetch } } : {}),
  });
  // "functionCalling" would force a tool call, which current Claude models reject; "jsonSchema"
  // uses output_config.format instead.
  const method = (config.structuredOutput ?? true) ? "jsonSchema" : "none";
  return {
    id: "anthropic",
    model,
    chatModel,
    complete: (request) =>
      completeWithLangChain(
        {
          chatModel,
          method,
          fallbackModel: model,
          checkFinish,
          mapError: (error) => toProviderError(error, NAME, baseUrl),
        },
        request,
      ),
  };
}
