import { modDraftJsonSchema } from "../mod/json-schema";
import type { ModDraft } from "../mod/schema";
import { validateModDraft } from "../mod/validate";
import { withRetryFeedback } from "../prompts/retry";
import type { Prompt } from "../prompts/types";
import type { ModelProvider, ProviderError } from "../providers/types";
import { err, ok, type Result } from "../result";
import { extractJson } from "./extract-json";

export type GenerateError =
  | { kind: "provider"; error: ProviderError }
  | { kind: "invalid-output"; message: string; issues: string[]; lastAnswer: string };

export interface GenerateOutput {
  draft: ModDraft;
  /** The model that answered, for the mod's createdBy field. */
  model: string;
  attempts: number;
}

export interface GenerateInput {
  provider: ModelProvider;
  prompt: Prompt;
  signal?: AbortSignal;
}

function parseDraft(text: string): Result<ModDraft, string[]> {
  const json = extractJson(text);
  return json.ok ? validateModDraft(json.value) : err([json.error]);
}

/** Asks the model for a mod, then retries once with the validation errors if it's invalid. */
export async function generateModDraft(
  input: GenerateInput,
): Promise<Result<GenerateOutput, GenerateError>> {
  const responseSchema = modDraftJsonSchema();
  let prompt = input.prompt;
  let lastAnswer = "";
  let issues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await input.provider.complete({
      ...prompt,
      responseSchema,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!completion.ok) return err({ kind: "provider", error: completion.error });
    lastAnswer = completion.value.text;
    const draft = parseDraft(lastAnswer);
    if (draft.ok)
      return ok({ draft: draft.value, model: completion.value.model, attempts: attempt });
    issues = draft.error;
    prompt = withRetryFeedback(input.prompt, lastAnswer || "(empty answer)", issues);
  }
  return err({
    kind: "invalid-output",
    message:
      "The model didn't produce a valid mod after two tries. Try again, rephrase the request, or pick a more capable model.",
    issues,
    lastAnswer,
  });
}
