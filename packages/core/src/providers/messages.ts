import { AIMessage, type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Prompt } from "../prompts/types";

export function toLangChainMessages(prompt: Prompt): BaseMessage[] {
  return [
    new SystemMessage(prompt.system),
    ...prompt.messages.map((message) =>
      message.role === "user" ? new HumanMessage(message.content) : new AIMessage(message.content),
    ),
  ];
}
