import type { Prompt } from "./types";

/** Adds the model's invalid answer and the validation errors so it can fix them once. */
export function withRetryFeedback(prompt: Prompt, invalidAnswer: string, errors: string[]): Prompt {
  const list = errors.map((error) => `- ${error}`).join("\n");
  return {
    ...prompt,
    messages: [
      ...prompt.messages,
      { role: "assistant", content: invalidAnswer },
      {
        role: "user",
        content: `Your answer was not a valid mod:\n${list}\n\nFix these problems and answer with the corrected JSON object only.`,
      },
    ],
  };
}
