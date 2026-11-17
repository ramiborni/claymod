import * as z from "zod";

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
]);

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderKind = ProviderConfig["kind"];
