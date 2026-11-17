import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { err, ok, type Result } from "../result";
import { toLangChainMessages } from "./messages";
import type { Completion, CompletionRequest, ProviderError } from "./types";

export type StructuredOutputMethod = "jsonSchema" | "jsonMode" | "none";

export interface CompleteOptions {
  chatModel: BaseChatModel;
  method: StructuredOutputMethod;
  fallbackModel: string;
  /** Returns an error for refusals or cut-off answers, read from the raw message. */
  checkFinish(message: AIMessage): ProviderError | undefined;
  mapError(error: unknown): ProviderError;
}

async function invokeRaw(
  options: CompleteOptions,
  request: CompletionRequest,
): Promise<BaseMessage> {
  const messages = toLangChainMessages(request);
  const config = request.signal ? { signal: request.signal } : {};
  if (options.method === "none" || !request.responseSchema) {
    return options.chatModel.invoke(messages, config);
  }
  // includeRaw keeps the model's text so invalid answers can be fed back for a retry;
  // Claymod validates the JSON itself with Zod.
  const structured = options.chatModel.withStructuredOutput(request.responseSchema, {
    method: options.method,
    includeRaw: true,
  });
  const { raw } = await structured.invoke(messages, config);
  return raw;
}

function modelName(message: AIMessage, fallback: string): string {
  const metadata = message.response_metadata;
  const name = metadata.model ?? metadata.model_name;
  return typeof name === "string" && name ? name : fallback;
}

/** One model call through LangChain, returning the answer text or a user-facing error. */
export async function completeWithLangChain(
  options: CompleteOptions,
  request: CompletionRequest,
): Promise<Result<Completion, ProviderError>> {
  let message: BaseMessage;
  try {
    message = await invokeRaw(options, request);
  } catch (error) {
    return err(options.mapError(error));
  }
  if (!AIMessage.isInstance(message)) {
    return err({
      kind: "invalid-response",
      message:
        "The model sent a response Claymod doesn't understand. Try again, or report a bug if it keeps happening.",
    });
  }
  const finishError = options.checkFinish(message);
  if (finishError) return err(finishError);
  return ok({ text: message.text, model: modelName(message, options.fallbackModel) });
}
