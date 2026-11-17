import { describe, expect, test } from "bun:test";
import { failingFetch, loadRecording, replayFetch } from "../../tests/helpers";
import { modDraftJsonSchema } from "../mod/json-schema";
import { createAnthropicProvider } from "./anthropic";

const request = {
  system: "rules",
  messages: [{ role: "user" as const, content: "hi" }],
  responseSchema: modDraftJsonSchema(),
};

async function run(recording: string, options: { structuredOutput?: boolean } = {}) {
  const { fetch, sent } = replayFetch([await loadRecording(`anthropic/${recording}`)]);
  const provider = createAnthropicProvider({ apiKey: "sk-test", fetch, maxRetries: 0, ...options });
  return { result: await provider.complete(request), sent };
}

describe("anthropic provider (LangChain ChatAnthropic)", () => {
  test("sends a Messages API request that works from the browser", async () => {
    const { sent } = await run("success.json");
    const [call] = sent;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers).toMatchObject({
      "anthropic-version": "2026-10-21",
      "anthropic-dangerous-direct-browser-access": "true",
      authorization: "Bearer sk-test",
    });
    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: "rules",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  test("uses output_config structured output, not a forced tool call", async () => {
    const { sent } = await run("success.json");
    const body = sent[0]?.body ?? {};
    expect(body).not.toHaveProperty("tool_choice");
    expect(body).toHaveProperty("output_config.format.type", "json_schema");
    const schema = JSON.stringify(body.output_config);
    // Keywords the API rejects must not reach it; Zod re-checks them afterwards.
    for (const keyword of ['"minLength"', '"maxLength"', '"$schema"'])
      expect(schema).not.toContain(keyword);
    expect(schema).toContain('"additionalProperties":false');
  });

  test("structured output can be turned off", async () => {
    const { sent } = await run("success.json", { structuredOutput: false });
    expect(sent[0]?.body).not.toHaveProperty("output_config");
  });

  test("returns only the text, skipping thinking blocks", async () => {
    const { result } = await run("success.json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.model).toBe("claude-opus-5-5");
      expect(JSON.parse(result.value.text).name).toBe("Hide promoted posts");
    }
  });

  test.each([
    ["refusal.json", "refused", "Rephrase"],
    ["max-tokens.json", "truncated", "cut off"],
    ["error-401.json", "auth", "Check the key"],
    ["error-529.json", "server", "overloaded"],
  ])("maps %s to a %s error with a next step", async (recording, kind, hint) => {
    const { result } = await run(recording);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(kind as never);
      expect(result.error.message).toContain(hint);
    }
  });

  test("passes Anthropic's own explanation through", async () => {
    const { result } = await run("error-401.json");
    if (!result.ok) expect(result.error.message).toContain("invalid x-api-key");
  });

  test("network failures say what to check", async () => {
    const provider = createAnthropicProvider({ apiKey: "k", fetch: failingFetch, maxRetries: 0 });
    const result = await provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
      expect(result.error.message).toContain("Couldn't reach https://api.anthropic.com");
    }
  });

  test("uses a custom model and base URL", async () => {
    const { fetch, sent } = replayFetch([await loadRecording("anthropic/success.json")]);
    const provider = createAnthropicProvider({
      apiKey: "k",
      model: "claude-sonnet-5-5",
      baseUrl: "https://proxy.test/",
      fetch,
      maxRetries: 0,
    });
    await provider.complete(request);
    expect(sent[0]?.url).toBe("https://proxy.test/v1/messages");
    expect(sent[0]?.body.model).toBe("claude-sonnet-5-5");
  });
});
