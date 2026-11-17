import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import type { JsonSchema } from "../mod/json-schema";
import type { ModDraft } from "../mod/schema";
import { validateModDraft } from "../mod/validate";
import { withRetryFeedback } from "../prompts/retry";
import type { Prompt } from "../prompts/types";
import type { ModelProvider, ProviderError } from "../providers/types";
import { err, type Result } from "../result";
import { extractJson } from "./extract-json";

/** One first attempt plus one retry that feeds the validation errors back. */
export const MAX_ATTEMPTS = 2;

export const GenerateState = Annotation.Root({
  /** The original create or repair prompt; retries are built from it, not stacked. */
  prompt: Annotation<Prompt>,
  /** What the next model call sends. */
  current: Annotation<Prompt>,
  attempts: Annotation<number>,
  lastAnswer: Annotation<string>,
  model: Annotation<string>,
  issues: Annotation<string[]>,
  draft: Annotation<ModDraft | undefined>,
  providerError: Annotation<ProviderError | undefined>,
});

type State = typeof GenerateState.State;

function parseDraft(text: string): Result<ModDraft, string[]> {
  const json = extractJson(text);
  return json.ok ? validateModDraft(json.value) : err([json.error]);
}

/**
 * callModel → validate → (done | addFeedback → callModel). The graph only orchestrates;
 * parsing and validation are the same pure functions used everywhere else.
 */
export function buildGenerateGraph(
  provider: Pick<ModelProvider, "complete">,
  responseSchema: JsonSchema,
) {
  const callModel = async (state: State, config: { signal?: AbortSignal }) => {
    const completion = await provider.complete({
      ...state.current,
      responseSchema,
      ...(config.signal ? { signal: config.signal } : {}),
    });
    if (!completion.ok) return { providerError: completion.error };
    return {
      attempts: state.attempts + 1,
      lastAnswer: completion.value.text,
      model: completion.value.model,
    };
  };

  const validate = (state: State) => {
    const draft = parseDraft(state.lastAnswer);
    return draft.ok ? { draft: draft.value, issues: [] } : { issues: draft.error };
  };

  const addFeedback = (state: State) => ({
    current: withRetryFeedback(state.prompt, state.lastAnswer || "(empty answer)", state.issues),
  });

  return new StateGraph(GenerateState)
    .addNode("callModel", callModel)
    .addNode("validate", validate)
    .addNode("addFeedback", addFeedback)
    .addEdge(START, "callModel")
    .addConditionalEdges("callModel", (state) => (state.providerError ? END : "validate"), [
      "validate",
      END,
    ])
    .addConditionalEdges(
      "validate",
      (state) => (state.draft || state.attempts >= MAX_ATTEMPTS ? END : "addFeedback"),
      ["addFeedback", END],
    )
    .addEdge("addFeedback", "callModel")
    .compile();
}
