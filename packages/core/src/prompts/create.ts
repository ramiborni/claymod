import type { Snapshot } from "../snapshot/schema";
import { renderSnapshot } from "./snapshot";
import { buildSystemPrompt } from "./system";
import type { Prompt } from "./types";

export interface CreatePromptInput {
  request: string;
  snapshot: Snapshot;
}

export function buildCreatePrompt({ request, snapshot }: CreatePromptInput): Prompt {
  const content = [
    renderSnapshot(snapshot),
    `<user_request>\n${request.trim()}\n</user_request>`,
    "Write a new mod for this request. Answer with the JSON object only.",
  ].join("\n\n");
  return { system: buildSystemPrompt(), messages: [{ role: "user", content }] };
}
