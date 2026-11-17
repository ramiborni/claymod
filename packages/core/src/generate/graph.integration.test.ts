import { expect, test } from "bun:test";
import { draft, snapshot } from "../../tests/fixtures";
import { loadRecording, replayFetch } from "../../tests/helpers";
import { buildCreatePrompt } from "../prompts/create";
import { createAnthropicProvider } from "../providers/anthropic";
import { generateModDraft } from "./generate";

test("LangGraph retry loop runs through LangChain's ChatAnthropic end to end", async () => {
  const invalid = await loadRecording("anthropic/success.json");
  const body = structuredClone(invalid.body) as { content: Array<{ type: string; text?: string }> };
  const textBlock = body.content.find((block) => block.type === "text");
  if (textBlock) textBlock.text = JSON.stringify({ ...draft, matches: ["example.com"] });

  const { fetch, sent } = replayFetch([
    { status: 200, body },
    await loadRecording("anthropic/success.json"),
  ]);
  const provider = createAnthropicProvider({ apiKey: "k", fetch, maxRetries: 0 });
  const prompt = buildCreatePrompt({ request: "Hide promoted posts", snapshot });

  const result = await generateModDraft({ provider, prompt });

  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value).toMatchObject({ attempts: 2, model: "claude-opus-5-5" });
  const retryMessages = sent[1]?.body.messages as Array<{ role: string; content: unknown }>;
  expect(retryMessages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  expect(JSON.stringify(retryMessages[2]?.content)).toContain(
    "matches.0: Not a valid Chrome match pattern",
  );
});
