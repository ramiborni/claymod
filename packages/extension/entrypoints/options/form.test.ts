import { describe, expect, test } from "bun:test";
import { toConfig, toFormValues } from "./form";

describe("options form", () => {
  test("defaults to a local Ollama server", () => {
    expect(toFormValues(undefined)).toMatchObject({
      kind: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
    });
  });

  test("builds an OpenAI-compatible config without an empty key", () => {
    const values = { ...toFormValues(undefined), model: " qwen3 " };
    expect(toConfig(values)).toEqual({
      ok: true,
      config: {
        kind: "openai-compatible",
        baseUrl: "http://localhost:11434/v1",
        model: "qwen3",
        responseFormat: "json_object",
      },
    });
  });

  test("says which field to fix", () => {
    expect(toConfig({ ...toFormValues(undefined), model: "" })).toEqual({
      ok: false,
      error: "Enter the model name, like llama3.1:8b.",
    });
    expect(toConfig({ ...toFormValues(undefined), kind: "anthropic", apiKey: "" })).toEqual({
      ok: false,
      error: "Enter your Anthropic API key.",
    });
  });

  test("round-trips an Anthropic config", () => {
    const config = {
      kind: "anthropic" as const,
      apiKey: "sk-ant",
      model: "claude-opus-5-5",
      structuredOutput: true,
    };
    expect(toConfig(toFormValues(config))).toEqual({ ok: true, config });
  });
});
