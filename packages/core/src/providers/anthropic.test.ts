import { describe, expect, test } from "bun:test";
import { failingFetch, loadRecording, replayFetch } from "../../tests/helpers";
import { ANTHROPIC_API_VERSION, createAnthropicProvider } from "./anthropic";

const request = {
  system: "rules",
  messages: [{ role: "user" as const, content: "hi" }],
  responseSchema: { type: "object", properties: { name: { type: "string", minLength: 1 } } },
};

async function run(recording: string, options: { structuredOutput?: boolean } = {}) {
  const { fetch, sent } = replayFetch([await loadRecording(`anthropic/${recording}`)]);
  const provider = createAnthropicProvider({ apiKey: "sk-test", fetch, ...options });
  return { result: await provider.complete(request), sent };
}

describe("anthropic provider", () => {
  test("sends a Messages API request with direct browser access headers", async () => {
    const { sent } = await run("success.json");
    const [call] = sent;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.headers).toMatchObject({
      "x-api-key": "sk-test",
      "anthropic-version": ANTHROPIC_API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    });
    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      system: "rules",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  test("requests structured output with a schema the API accepts", async () => {
    const { sent } = await run("success.json");
    expect(sent[0]?.body.output_config).toEqual({
      format: {
        type: "json_schema",
        schema: { type: "object", properties: { name: { type: "string" } } },
      },
    });
  });

  test("structured output can be turned off", async () => {
    const { sent } = await run("success.json", { structuredOutput: false });
    expect(sent[0]?.body).not.toHaveProperty("output_config");
  });

  test("returns only text blocks, skipping thinking blocks", async () => {
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

  test("network failures say what to check", async () => {
    const provider = createAnthropicProvider({ apiKey: "k", fetch: failingFetch });
    const result = await provider.complete(request);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "network",
        message:
          "Couldn't reach https://api.anthropic.com. Check the base URL and that the server is running, then try again.",
      },
    });
  });

  test("uses a custom model and base URL", async () => {
    const { fetch, sent } = replayFetch([await loadRecording("anthropic/success.json")]);
    const provider = createAnthropicProvider({
      apiKey: "k",
      model: "claude-sonnet-5-5",
      baseUrl: "https://proxy.test/",
      fetch,
    });
    await provider.complete(request);
    expect(sent[0]?.url).toBe("https://proxy.test/v1/messages");
    expect(sent[0]?.body.model).toBe("claude-sonnet-5-5");
  });
});
