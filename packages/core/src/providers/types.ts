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
  complete(request: CompletionRequest): Promise<Result<Completion, ProviderError>>;
}

/** The subset of fetch the adapters use, so tests can pass recorded responses. */
export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
