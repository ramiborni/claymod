import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { JsonSchema } from "../mod/json-schema";
import type { Prompt } from "../prompts/types";
import type { Result } from "../result";

export type ProviderErrorKind =
  | "network"
  | "auth"
  | "forbidden"
  | "not-found"
  | "rate-limit"
  | "bad-request"
  | "server"
  | "refused"
  | "truncated"
  | "invalid-response";

/** message is shown to the user and must say what to do next. */
export interface ProviderError {
  kind: ProviderErrorKind;
  message: string;
  status?: number;
}

export interface CompletionRequest extends Prompt {
  /** JSON Schema the answer must follow, for providers that can enforce it. */
  responseSchema?: JsonSchema;
  signal?: AbortSignal;
}

export interface Completion {
  text: string;
  /** The model that actually answered, as reported by the provider. */
  model: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  /** The underlying LangChain chat model, for graphs that need more than complete(). */
  readonly chatModel: BaseChatModel;
  complete(request: CompletionRequest): Promise<Result<Completion, ProviderError>>;
}

/** Shared options for building a provider. */
export interface ProviderRuntime {
  /** Replaces the SDK's fetch; tests pass recorded responses here. */
  fetch?: typeof fetch | undefined;
  /** LangChain retries 429 / 5xx / network errors with backoff. */
  maxRetries?: number | undefined;
}
