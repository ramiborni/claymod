import * as z from "zod";

/**
 * Tools that agents call through `claymod-bridge mcp` (M5). The MCP server, the bridge link and
 * the extension share these names and argument schemas. Mods themselves are validated by the
 * extension with the mod schema, so a bad draft comes back with the exact issues to fix.
 */
export const AGENT_TOOL_NAMES = [
  "get_active_page",
  "list_mods",
  "get_mod_status",
  "preview_mod",
  "save_mod",
] as const;
export const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES);
export type AgentToolName = z.infer<typeof agentToolNameSchema>;

const modArgument = z
  .record(z.string(), z.unknown())
  .describe(
    "The mod: { name, description, matches, css?, js?, runAt, checks } as described in the server instructions.",
  );

export const agentToolArgs = {
  get_active_page: z.strictObject({}),
  list_mods: z.strictObject({
    site: z
      .string()
      .max(253)
      .optional()
      .describe("Only mods that run on this host name, e.g. www.example.com"),
  }),
  get_mod_status: z.strictObject({ id: z.string().min(1).max(64).describe("The mod's id") }),
  preview_mod: z.strictObject({ mod: modArgument }),
  save_mod: z.strictObject({
    mod: modArgument,
    replaces: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe("Id of an existing mod to update; the new code becomes its next version"),
  }),
} as const satisfies Record<AgentToolName, z.ZodType>;

export type AgentToolArgs<T extends AgentToolName> = z.infer<(typeof agentToolArgs)[T]>;

/** Waiting for the user to approve a preview or save in the side panel. */
export const AGENT_APPROVAL_TIMEOUT_MS = 170_000;

/** One tool call from an agent, pushed by the bridge to the extension. */
export const agentCallSchema = z.strictObject({
  type: z.literal("agentCall"),
  callId: z.string().min(1).max(64),
  tool: agentToolNameSchema,
  args: z.unknown(),
  /** The MCP client's self-reported name, shown in the approval card. */
  client: z.string().max(100),
});
export type AgentCall = z.infer<typeof agentCallSchema>;

export const agentResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export type AgentResult = z.infer<typeof agentResultSchema>;
