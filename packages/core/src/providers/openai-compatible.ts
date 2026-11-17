import type { AIMessage } from "@langchain/core/messages";
import { ChatOpenAICompletions } from "@langchain/openai";
import { completeWithLangChain, type StructuredOutputMethod } from "./complete";
import { toProviderError } from "./errors";
import type { ModelProvider, ProviderError, ProviderRuntime } from "./types";

/**
 * How to ask for JSON. Support differs by server: "json_object" works on OpenAI, Ollama,
 * LM Studio and most OpenRouter models; "json_schema" is stricter but less widely supported.
 */
export type ResponseFormatMode = "json_schema" | "json_object" | "none";

export interface OpenAICompatibleConfig extends ProviderRuntime {
  /** e.g. http://localhost:11434/v1 (Ollama), https://openrouter.ai/api/v1, https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  apiKey?: string | undefined;
  responseFormat?: ResponseFormatMode | undefined;
  /** chrome-extension://<id>, used to explain Ollama's OLLAMA_ORIGINS setting. */
  extensionOrigin?: string | undefined;
}

const MAX_TOKENS = 16_000;
const NAME = "The model server";
// The OpenAI SDK requires a key; local servers such as Ollama ignore it.
const NO_KEY = "not-needed";

const METHODS: Record<ResponseFormatMode, StructuredOutputMethod> = {
  json_object: "jsonMode",
  json_schema: "jsonSchema",
  none: "none",
};

function looksLikeOllama(baseUrl: string): boolean {
  const { hostname, port } = new URL(baseUrl);
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) && port === "11434";
}

function mapError(error: unknown, config: OpenAICompatibleConfig): ProviderError {
  const mapped = toProviderError(error, NAME, config.baseUrl);
  if (!looksLikeOllama(config.baseUrl)) return mapped;
  const origin = config.extensionOrigin ?? "chrome-extension://<extension id>";
  if (mapped.status === 403) {
    return {
      ...mapped,
      message: `Ollama blocked the extension. Set OLLAMA_ORIGINS=${origin} and restart Ollama.`,
    };
  }
  // Ollama's 403 for a blocked origin has no CORS headers, so the browser reports a network error.
  if (mapped.kind === "network") {
    return {
      ...mapped,
      message: `Couldn't reach Ollama at ${new URL(config.baseUrl).origin}. Start Ollama if it isn't running. If it is, it's blocking the extension: set OLLAMA_ORIGINS=${origin} and restart Ollama.`,
    };
  }
  return mapped;
}

function checkFinish(message: AIMessage): ProviderError | undefined {
  if (message.additional_kwargs.refusal) {
    return {
      kind: "refused",
      message: "The model declined this request. Rephrase what you want to change and try again.",
    };
  }
  if (message.response_metadata.finish_reason === "length") {
    return {
      kind: "truncated",
      message:
        "The model's answer was cut off. Ask for a smaller change, or use a model with a larger output limit.",
    };
  }
  return undefined;
}

/**
 * Chat Completions API (Ollama, LM Studio, OpenRouter, OpenAI) via LangChain. Uses
 * ChatOpenAICompletions, not ChatOpenAI, so requests never switch to the Responses API,
 * which local servers don't implement.
 */
export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): ModelProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const chatModel = new ChatOpenAICompletions({
    model: config.model,
    apiKey: config.apiKey || NO_KEY,
    maxTokens: MAX_TOKENS,
    maxRetries: config.maxRetries ?? 2,
    configuration: { baseURL: baseUrl, ...(config.fetch ? { fetch: config.fetch } : {}) },
  });
  const method = METHODS[config.responseFormat ?? "json_object"];
  return {
    id: "openai-compatible",
    model: config.model,
    chatModel,
    complete: (request) =>
      completeWithLangChain(
        {
          chatModel,
          method,
          fallbackModel: config.model,
          checkFinish,
          mapError: (error) => mapError(error, config),
        },
        request,
      ),
  };
}
