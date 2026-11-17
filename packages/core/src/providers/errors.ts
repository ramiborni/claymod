import type { ProviderError } from "./types";

function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" ? field : undefined;
}

/** The provider's own explanation, from SDK errors shaped like { error: { message } }. */
function detailOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("error" in error)) return undefined;
  const body = error.error;
  if (typeof body !== "object" || body === null) return undefined;
  const inner = "error" in body ? body.error : body;
  if (typeof inner === "object" && inner !== null && "message" in inner) {
    return typeof inner.message === "string" && inner.message ? inner.message : undefined;
  }
  return undefined;
}

const isAbort = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));

/** Maps LangChain / vendor SDK errors to messages that say what to do next. */
export function toProviderError(
  error: unknown,
  providerName: string,
  baseUrl: string,
): ProviderError {
  const status = numberField(error, "status");
  if (status === undefined) {
    if (isAbort(error))
      return { kind: "network", message: "The request was cancelled or timed out. Try again." };
    return {
      kind: "network",
      message: `Couldn't reach ${new URL(baseUrl).origin}. Check the base URL and that the server is running, then try again.`,
    };
  }
  const detail = detailOf(error);
  const said = detail ? ` (${providerName} said: ${detail})` : "";
  const base = { status };
  if (status === 401)
    return {
      ...base,
      kind: "auth",
      message: `${providerName} rejected the API key. Check the key in Claymod's settings.${said}`,
    };
  if (status === 403)
    return {
      ...base,
      kind: "forbidden",
      message: `${providerName} refused access. Check that the key is allowed to use this model.${said}`,
    };
  if (status === 404)
    return {
      ...base,
      kind: "not-found",
      message: `${providerName} couldn't find the model or endpoint. Check the base URL and model name in Claymod's settings.${said}`,
    };
  if (status === 429)
    return {
      ...base,
      kind: "rate-limit",
      message: `${providerName} is rate limiting requests or your quota is used up. Wait a moment and try again.${said}`,
    };
  if (status === 529)
    return {
      ...base,
      kind: "server",
      message: `${providerName} is overloaded right now. Try again in a minute.`,
    };
  if (status >= 500)
    return {
      ...base,
      kind: "server",
      message: `${providerName} had a server error (${status}). Try again in a minute.${said}`,
    };
  return {
    ...base,
    kind: "bad-request",
    message: `${providerName} rejected the request (${status}).${said}`,
  };
}
