import { expect, test } from "bun:test";
import { loadRecording, replayFetch } from "../../tests/helpers";
import { createOpenAICompatibleProvider } from "./openai-compatible";
import { testConnection } from "./test-connection";

test("testConnection reports the answering model, without asking for JSON", async () => {
  const { fetch, sent } = replayFetch([
    await loadRecording("openai-compatible/ollama-success.json"),
  ]);
  const provider = createOpenAICompatibleProvider({
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1:8b",
    fetch,
    maxRetries: 0,
  });
  expect(await testConnection(provider)).toEqual({ ok: true, value: { model: "llama3.1:8b" } });
  expect(sent[0]?.body).not.toHaveProperty("response_format");
});

test("testConnection passes provider errors through", async () => {
  const { fetch } = replayFetch([await loadRecording("openai-compatible/error-401.json")]);
  const provider = createOpenAICompatibleProvider({
    baseUrl: "https://api.openai.com/v1",
    model: "m",
    fetch,
    maxRetries: 0,
  });
  const result = await testConnection(provider);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.kind).toBe("auth");
});
