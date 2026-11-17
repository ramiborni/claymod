import { err, ok, type Result } from "../result";
import type { FetchLike, ProviderError } from "./types";

export interface PostJsonInput {
  fetch: FetchLike;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal | undefined;
}

export interface HttpFailure {
  status: number;
  body: unknown;
}

export type PostJsonResult = Result<unknown, ProviderError | HttpFailure>;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** POSTs JSON. Network failures become ProviderErrors; HTTP errors are returned for mapping. */
export async function postJson(input: PostJsonInput): Promise<PostJsonResult> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await input.fetch(input.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...input.headers },
      body: JSON.stringify(input.body),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    return err({
      kind: "network",
      message: aborted
        ? "The request was cancelled or timed out. Try again."
        : `Couldn't reach ${new URL(input.url).origin}. Check the base URL and that the server is running, then try again.`,
    });
  }
  const body = parseJson(await response.text());
  return response.ok ? ok(body) : err({ status: response.status, body });
}

export const isProviderError = (value: ProviderError | HttpFailure): value is ProviderError =>
  "kind" in value;

/** Reads `error.message` from the common `{ error: { message } }` shape, if present. */
export function errorMessageOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = body.error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return typeof error.message === "string" ? error.message : undefined;
  }
  return undefined;
}

/** Generic status mapping; adapters override the cases they know better. */
export function mapHttpFailure(failure: HttpFailure, providerName: string): ProviderError {
  const detail = errorMessageOf(failure.body);
  const suffix = detail ? ` (${providerName} said: ${detail})` : "";
  const status = failure.status;
  const base = { status };
  if (status === 401)
    return {
      ...base,
      kind: "auth",
      message: `${providerName} rejected the API key. Check the key in Claymod's settings.${suffix}`,
    };
  if (status === 403)
    return {
      ...base,
      kind: "forbidden",
      message: `${providerName} refused access. Check that the key is allowed to use this model.${suffix}`,
    };
  if (status === 404)
    return {
      ...base,
      kind: "not-found",
      message: `${providerName} couldn't find the model or endpoint. Check the base URL and model name in Claymod's settings.${suffix}`,
    };
  if (status === 429)
    return {
      ...base,
      kind: "rate-limit",
      message: `${providerName} is rate limiting requests or your quota is used up. Wait a moment and try again.${suffix}`,
    };
  if (status >= 500)
    return {
      ...base,
      kind: "server",
      message: `${providerName} had a server error (${status}). Try again in a minute.${suffix}`,
    };
  return {
    ...base,
    kind: "bad-request",
    message: `${providerName} rejected the request (${status}).${suffix}`,
  };
}
