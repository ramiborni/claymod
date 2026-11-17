import * as z from "zod";
import { AGENT_MODEL_PATTERN, agentAuthSchema, agentIdSchema } from "../bridge/protocol";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

/** Provider settings as stored by the options page. */
export const providerConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("openai-compatible"),
    baseUrl: z.url(),
    model: z.string().min(1),
    apiKey: z.string().optional(),
    responseFormat: z.enum(["json_schema", "json_object", "none"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("anthropic"),
    apiKey: z.string().min(1),
    model: z.string().min(1).optional(),
    baseUrl: z.url().optional(),
    structuredOutput: z.boolean().optional(),
  }),
  // A local agent CLI reached through claymod-bridge. Its API key (if any) lives in the OS
  // keychain on the bridge side, never in the extension.
  z.strictObject({
    kind: z.literal("local-agent"),
    agent: agentIdSchema,
    auth: agentAuthSchema,
    model: z.string().regex(AGENT_MODEL_PATTERN).optional(),
  }),
]);

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderKind = ProviderConfig["kind"];
