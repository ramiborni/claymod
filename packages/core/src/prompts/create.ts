import type { Snapshot } from "../snapshot/schema";
import { type PromptBudget, renderSnapshot } from "./snapshot";
import { buildSystemPrompt } from "./system";
import type { Prompt } from "./types";

export interface CreatePromptInput {
  request: string;
  snapshot: Snapshot;
  budget?: PromptBudget | undefined;
}

export function buildCreatePrompt({ request, snapshot, budget }: CreatePromptInput): Prompt {
  const content = [
    renderSnapshot(snapshot, budget),
    `<user_request>\n${request.trim()}\n</user_request>`,
    "Write a new mod for this request. Answer with the JSON object only.",
  ].join("\n\n");
  return { system: buildSystemPrompt(), messages: [{ role: "user", content }] };
}
