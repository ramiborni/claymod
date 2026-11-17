import * as z from "zod";
import { toStrictOutputSchema } from "../mod/json-schema";
import { err, ok, type Result } from "../result";
import { isProviderError, mapHttpFailure, postJson } from "./http";
import type {
  Completion,
  CompletionRequest,
  FetchLike,
  ModelProvider,
  ProviderError,
} from "./types";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";
export const ANTHROPIC_API_VERSION = "2026-10-21";
const MAX_TOKENS = 16_000;
const NAME = "Anthropic";

export interface AnthropicConfig {
  apiKey: string;
  model?: string | undefined;
  baseUrl?: string | undefined;
  /** Ask the API to enforce the mod JSON Schema (structured outputs). */
  structuredOutput?: boolean | undefined;
  fetch?: FetchLike | undefined;
}

const responseSchema = z.object({
  model: z.string(),
  stop_reason: z.string().nullable(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

function buildBody(config: Required<Omit<AnthropicConfig, "fetch">>, request: CompletionRequest) {
  const outputConfig =
    config.structuredOutput && request.responseSchema
      ? {
          output_config: {
            format: { type: "json_schema", schema: toStrictOutputSchema(request.responseSchema) },
          },
        }
      : {};
  return {
    model: config.model,
    max_tokens: MAX_TOKENS,
    system: request.system,
    messages: request.messages,
    ...outputConfig,
  };
}

function toCompletion(body: unknown): Result<Completion, ProviderError> {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return err({
      kind: "invalid-response",
      message: `${NAME} sent a response Claymod doesn't understand. Try again, or report a bug if it keeps happening.`,
    });
  }
  const { stop_reason: stopReason, content, model } = parsed.data;
  if (stopReason === "refusal") {
    return err({
      kind: "refused",
      message: "The model declined this request. Rephrase what you want to change and try again.",
    });
  }
  if (stopReason === "max_tokens") {
    return err({
      kind: "truncated",
      message: "The model's answer was cut off. Ask for a smaller change and try again.",
    });
  }
  // Thinking blocks and others are skipped; only text carries the answer.
  const text = content
    .flatMap((block) => (block.type === "text" && block.text ? [block.text] : []))
    .join("");
  return ok({ text, model });
}

function mapFailure(failure: { status: number; body: unknown }): ProviderError {
  if (failure.status === 529) {
    return {
      kind: "server",
      status: 529,
      message: `${NAME} is overloaded right now. Try again in a minute.`,
    };
  }
  return mapHttpFailure(failure, NAME);
}

/** Direct browser access to the Messages API with the user's own key. */
export function createAnthropicProvider(config: AnthropicConfig): ModelProvider {
  const settings = {
    apiKey: config.apiKey,
    model: config.model || ANTHROPIC_DEFAULT_MODEL,
    baseUrl: (config.baseUrl || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    structuredOutput: config.structuredOutput ?? true,
  };
  const fetchImpl: FetchLike = config.fetch ?? ((url, init) => globalThis.fetch(url, init));
  return {
    id: "anthropic",
    model: settings.model,
    async complete(request) {
      const result = await postJson({
        fetch: fetchImpl,
        url: `${settings.baseUrl}/v1/messages`,
        headers: {
          "x-api-key": settings.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
          // Required for CORS. Safe here: the key is the user's own and never leaves their browser
          // except to Anthropic.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: buildBody(settings, request),
        signal: request.signal,
      });
      if (!result.ok)
        return err(isProviderError(result.error) ? result.error : mapFailure(result.error));
      return toCompletion(result.value);
    },
  };
}
