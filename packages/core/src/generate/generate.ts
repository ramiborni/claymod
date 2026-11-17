import { modDraftJsonSchema } from "../mod/json-schema";
import type { ModDraft } from "../mod/schema";
import type { Prompt } from "../prompts/types";
import type { ModelProvider, ProviderError } from "../providers/types";
import { err, ok, type Result } from "../result";
import { buildGenerateGraph } from "./graph";

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
  provider: Pick<ModelProvider, "complete">;
  prompt: Prompt;
  signal?: AbortSignal;
}

/** Asks the model for a mod, then retries once with the validation errors if it's invalid. */
export async function generateModDraft(
  input: GenerateInput,
): Promise<Result<GenerateOutput, GenerateError>> {
  const graph = buildGenerateGraph(input.provider, modDraftJsonSchema());
  const state = await graph.invoke(
    {
      prompt: input.prompt,
      current: input.prompt,
      attempts: 0,
      lastAnswer: "",
      model: "",
      issues: [],
      draft: undefined,
      providerError: undefined,
    },
    input.signal ? { signal: input.signal } : {},
  );
  if (state.providerError) return err({ kind: "provider", error: state.providerError });
  if (state.draft) return ok({ draft: state.draft, model: state.model, attempts: state.attempts });
  return err({
    kind: "invalid-output",
    message:
      "The model didn't produce a valid mod after two tries. Try again, rephrase the request, or pick a more capable model.",
    issues: state.issues,
    lastAnswer: state.lastAnswer,
  });
}
