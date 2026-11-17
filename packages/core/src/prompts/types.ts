export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Provider-neutral prompt: one system prompt plus alternating user/assistant turns. */
export interface Prompt {
  system: string;
  messages: ChatMessage[];
}
