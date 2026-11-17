import { describe, expect, test } from "bun:test";
import { providerConfigSchema } from "./config";
import { createProvider } from "./index";

describe("createProvider", () => {
  test("builds the provider for each config kind", () => {
    const anthropic = createProvider({ kind: "anthropic", apiKey: "k" });
    expect([anthropic.id, anthropic.model]).toEqual(["anthropic", "claude-opus-5-5"]);
    const local = createProvider({
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen3",
    });
    expect([local.id, local.model]).toEqual(["openai-compatible", "qwen3"]);
  });
});

describe("providerConfigSchema", () => {
  test("rejects an unknown kind or a missing Anthropic key", () => {
    expect(providerConfigSchema.safeParse({ kind: "claude-ai-login" }).success).toBe(false);
    expect(providerConfigSchema.safeParse({ kind: "anthropic", apiKey: "" }).success).toBe(false);
  });
});
