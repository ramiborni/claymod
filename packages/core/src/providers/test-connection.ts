import { err, ok, type Result } from "../result";
import type { ModelProvider, ProviderError } from "./types";

/** Sends one tiny request to check the key, URL and model before the user relies on them. */
export async function testConnection(
  provider: Pick<ModelProvider, "complete">,
  signal?: AbortSignal,
): Promise<Result<{ model: string }, ProviderError>> {
  const result = await provider.complete({
    system: "You check connectivity. Reply with the single word OK.",
    messages: [{ role: "user", content: "ping" }],
    ...(signal ? { signal } : {}),
  });
  return result.ok ? ok({ model: result.value.model }) : err(result.error);
}
