import { expect, test } from "bun:test";
import { createAnthropicProvider } from "./anthropic";

test("the default fetch is blocked in unit tests, so nothing reaches the network", async () => {
  const provider = createAnthropicProvider({ apiKey: "k" });
  const result = await provider.complete({
    system: "",
    messages: [{ role: "user", content: "x" }],
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.kind).toBe("network");
});
