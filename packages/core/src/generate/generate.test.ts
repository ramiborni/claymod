import { describe, expect, test } from "bun:test";
import { draft, snapshot } from "../../tests/fixtures";
import { buildCreatePrompt } from "../prompts/create";
import type { CompletionRequest, ModelProvider, ProviderError } from "../providers/types";
import { err, ok } from "../result";
import { extractJson } from "./extract-json";
import { generateModDraft } from "./generate";

/** A provider that returns scripted answers and records each request. */
function scriptedProvider(answers: Array<string | ProviderError>) {
  const requests: CompletionRequest[] = [];
  const provider: ModelProvider = {
    id: "scripted",
    model: "test-model",
    async complete(request) {
      requests.push(request);
      const answer = answers.shift();
      if (answer === undefined) throw new Error("no more scripted answers");
      return typeof answer === "string"
        ? ok({ text: answer, model: "test-model-v2" })
        : err(answer);
    },
  };
  return { provider, requests };
}

const prompt = buildCreatePrompt({ request: "Hide promoted posts", snapshot });
const valid = JSON.stringify(draft);

describe("generateModDraft", () => {
  test("returns a valid draft on the first try, with the schema attached", async () => {
    const { provider, requests } = scriptedProvider([valid]);
    const result = await generateModDraft({ provider, prompt });
    expect(result).toEqual({ ok: true, value: { draft, model: "test-model-v2", attempts: 1 } });
    expect(requests[0]?.responseSchema).toHaveProperty("properties.matches");
  });

  test("retries once with the validation errors, then succeeds", async () => {
    const invalid = JSON.stringify({ ...draft, matches: ["example.com"] });
    const { provider, requests } = scriptedProvider([invalid, valid]);
    const result = await generateModDraft({ provider, prompt });
    expect(result.ok && result.value.attempts).toBe(2);
    const retryMessages = requests[1]?.messages ?? [];
    expect(retryMessages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retryMessages[1]?.content).toBe(invalid);
    expect(retryMessages[2]?.content).toContain("matches.0: Not a valid Chrome match pattern");
  });

  test("feeds back non-JSON answers too", async () => {
    const { provider, requests } = scriptedProvider(["Sure! Here's your mod.", valid]);
    await generateModDraft({ provider, prompt });
    expect(requests[1]?.messages[2]?.content).toContain("not valid JSON");
  });

  test("gives up after one retry with the last issues", async () => {
    const { provider, requests } = scriptedProvider(["{}", "{}"]);
    const result = await generateModDraft({ provider, prompt });
    expect(requests).toHaveLength(2);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "invalid-output") {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.lastAnswer).toBe("{}");
      expect(result.error.message).toContain("Try again");
    }
  });

  test("the retry is built from the original prompt, not stacked", async () => {
    const { provider, requests } = scriptedProvider(["{}", "{}"]);
    await generateModDraft({ provider, prompt });
    expect(requests[1]?.messages).toHaveLength(3);
  });

  test("provider errors stop immediately without a retry", async () => {
    const failure: ProviderError = { kind: "auth", message: "bad key" };
    const { provider, requests } = scriptedProvider([failure]);
    const result = await generateModDraft({ provider, prompt });
    expect(result).toEqual({ ok: false, error: { kind: "provider", error: failure } });
    expect(requests).toHaveLength(1);
  });
});

describe("extractJson", () => {
  test("parses plain, fenced and wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson('Here you go: {"a":1} Enjoy!')).toEqual({ ok: true, value: { a: 1 } });
  });

  test("fails with an instruction the model can act on", () => {
    expect(extractJson("no json here")).toEqual({
      ok: false,
      error: "The answer was not valid JSON. Answer with a single JSON object.",
    });
  });
});
