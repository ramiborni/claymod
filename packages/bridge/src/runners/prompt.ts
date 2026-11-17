import type { RunPrompt } from "./types";

/**
 * Agent CLIs take one prompt, not a chat history. A retry after invalid output has three turns
 * (request, bad answer, feedback), so they are written out in order with clear boundaries.
 */
export function conversationText(messages: RunPrompt["messages"]): string {
  const [only] = messages;
  if (messages.length === 1 && only?.role === "user") return only.content;
  const turns = messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join("\n");
  return `<conversation>\n${turns}\n</conversation>\n\nAnswer the last user message.`;
}

/** For CLIs without a system-prompt flag, the system prompt goes first. */
export function fullPromptText(prompt: RunPrompt): string {
  return `<instructions>\n${prompt.system}\n</instructions>\n\n${conversationText(prompt.messages)}`;
}
