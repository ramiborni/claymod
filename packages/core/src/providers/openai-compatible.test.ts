import { describe, expect, test } from "bun:test";
import { loadRecording, replayFetch } from "../../tests/helpers";
import { createOpenAICompatibleProvider, type OpenAICompatibleConfig } from "./openai-compatible";

const request = {
  system: "rules",
  messages: [{ role: "user" as const, content: "hi" }],
  responseSchema: { type: "object" },
};

const OLLAMA = "http://localhost:11434/v1/";

async function run(recording: string, config: Partial<OpenAICompatibleConfig> = {}) {
  const { fetch, sent } = replayFetch([await loadRecording(`openai-compatible/${recording}`)]);
  const provider = createOpenAICompatibleProvider({
    baseUrl: OLLAMA,
    model: "llama3.1:8b",
    fetch,
    ...config,
  });
  return { result: await provider.complete(request), sent };
}

describe("openai-compatible provider", () => {
  test("posts to /chat/completions with the system prompt first and json_object mode", async () => {
    const { sent } = await run("ollama-success.json");
    expect(sent[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(sent[0]?.headers).not.toHaveProperty("authorization");
    expect(sent[0]?.body).toMatchObject({
      model: "llama3.1:8b",
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "hi" },
      ],
      response_format: { type: "json_object" },
    });
  });

  test("sends the API key as a bearer token when set", async () => {
    const { sent } = await run("ollama-success.json", { apiKey: "sk-or" });
    expect(sent[0]?.headers.authorization).toBe("Bearer sk-or");
  });

  test("json_schema mode sends the schema; none sends no response_format", async () => {
    const schemaRun = await run("ollama-success.json", { responseFormat: "json_schema" });
    expect(schemaRun.sent[0]?.body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "claymod_mod", schema: { type: "object" }, strict: false },
    });
    const noneRun = await run("ollama-success.json", { responseFormat: "none" });
    expect(noneRun.sent[0]?.body).not.toHaveProperty("response_format");
  });

  test("returns the message content and the reported model", async () => {
    const { result } = await run("ollama-success.json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.model).toBe("llama3.1:8b");
      expect(result.value.text).toStartWith("```json");
    }
  });

  test("explains OLLAMA_ORIGINS with the real extension origin on an Ollama 403", async () => {
    const { result } = await run("ollama-403.json", {
      extensionOrigin: "chrome-extension://abcdefghijklmnop",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "forbidden",
        status: 403,
        message:
          "Ollama blocked the extension. Set OLLAMA_ORIGINS=chrome-extension://abcdefghijklmnop and restart Ollama.",
      },
    });
  });

  test("a 403 from another server is a generic access error", async () => {
    const { result } = await run("ollama-403.json", { baseUrl: "https://openrouter.ai/api/v1" });
    if (!result.ok) expect(result.error.message).not.toContain("OLLAMA_ORIGINS");
  });

  test("passes the provider's own error message through", async () => {
    const { result } = await run("error-401.json", { baseUrl: "https://api.openai.com/v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("auth");
      expect(result.error.message).toContain("Incorrect API key provided.");
    }
  });

  test("a truncated answer is an error, not a half mod", async () => {
    const { result } = await run("length.json");
    if (!result.ok) expect(result.error.kind).toBe("truncated");
    expect(result.ok).toBe(false);
  });

  test("a non-OpenAI response points at the base URL", async () => {
    const { fetch } = replayFetch([{ status: 200, body: "<html>login</html>" }]);
    const provider = createOpenAICompatibleProvider({
      baseUrl: "http://localhost:1234",
      model: "m",
      fetch,
    });
    const result = await provider.complete(request);
    if (!result.ok) expect(result.error.message).toContain("/v1");
    expect(result.ok).toBe(false);
  });
});
