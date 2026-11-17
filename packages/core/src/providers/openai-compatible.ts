import * as z from "zod";
import { err, ok, type Result } from "../result";
import { type HttpFailure, isProviderError, mapHttpFailure, postJson } from "./http";
import type {
  Completion,
  CompletionRequest,
  FetchLike,
  ModelProvider,
  ProviderError,
} from "./types";

/**
 * How to ask for JSON. Support differs by server: "json_object" works on OpenAI, Ollama,
 * LM Studio and most OpenRouter models; "json_schema" is stricter but less widely supported.
 */
export type ResponseFormatMode = "json_schema" | "json_object" | "none";

export interface OpenAICompatibleConfig {
  /** e.g. http://localhost:11434/v1 (Ollama), https://openrouter.ai/api/v1, https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
  apiKey?: string | undefined;
  responseFormat?: ResponseFormatMode | undefined;
  /** chrome-extension://<id>, used to explain Ollama's OLLAMA_ORIGINS setting. */
  extensionOrigin?: string | undefined;
  fetch?: FetchLike | undefined;
}

const MAX_TOKENS = 16_000;
const NAME = "The model server";

const responseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

function responseFormat(mode: ResponseFormatMode, request: CompletionRequest) {
  if (mode === "json_object") return { response_format: { type: "json_object" } };
  if (mode === "json_schema" && request.responseSchema) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: { name: "claymod_mod", schema: request.responseSchema, strict: false },
      },
    };
  }
  return {};
}

function looksLikeOllama(baseUrl: string): boolean {
  const { hostname, port } = new URL(baseUrl);
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) && port === "11434";
}

function mapFailure(failure: HttpFailure, config: OpenAICompatibleConfig): ProviderError {
  if (failure.status === 403 && looksLikeOllama(config.baseUrl)) {
    const origin = config.extensionOrigin ?? "chrome-extension://<extension id>";
    return {
      kind: "forbidden",
      status: 403,
      message: `Ollama blocked the extension. Set OLLAMA_ORIGINS=${origin} and restart Ollama.`,
    };
  }
  return mapHttpFailure(failure, NAME);
}

function toCompletion(body: unknown, fallbackModel: string): Result<Completion, ProviderError> {
  const parsed = responseSchema.safeParse(body);
  const choice = parsed.success ? parsed.data.choices[0] : undefined;
  if (!parsed.success || !choice) {
    return err({
      kind: "invalid-response",
      message: `${NAME} sent a response Claymod doesn't understand. Check that the base URL points to an OpenAI-compatible API (it usually ends in /v1).`,
    });
  }
  if (choice.message.refusal) {
    return err({
      kind: "refused",
      message: "The model declined this request. Rephrase what you want to change and try again.",
    });
  }
  if (choice.finish_reason === "length") {
    return err({
      kind: "truncated",
      message:
        "The model's answer was cut off. Ask for a smaller change, or use a model with a larger output limit.",
    });
  }
  return ok({ text: choice.message.content ?? "", model: parsed.data.model ?? fallbackModel });
}

/** Chat Completions API: Ollama, LM Studio, OpenRouter, OpenAI and compatible servers. */
export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): ModelProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const fetchImpl: FetchLike = config.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const mode = config.responseFormat ?? "json_object";
  return {
    id: "openai-compatible",
    model: config.model,
    async complete(request) {
      const result = await postJson({
        fetch: fetchImpl,
        url: `${baseUrl}/chat/completions`,
        headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
        body: {
          model: config.model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "system", content: request.system }, ...request.messages],
          ...responseFormat(mode, request),
        },
        signal: request.signal,
      });
      if (!result.ok) {
        return err(isProviderError(result.error) ? result.error : mapFailure(result.error, config));
      }
      return toCompletion(result.value, config.model);
    },
  };
}
