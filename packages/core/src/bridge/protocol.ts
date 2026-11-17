import * as z from "zod";
import { agentResultSchema } from "./agent-tools";

export * from "./agent-tools";

/**
 * Messages between the extension and claymod-bridge over Chrome native messaging.
 * The bridge only runs the agent and returns its raw answer; the extension validates it with the
 * same Zod schema (and one retry) as every other provider.
 */

/** The native messaging host name: lowercase, digits, underscores and dots only. */
export const BRIDGE_HOST_NAME = "claymod.bridge";

/** Bumped when the protocol changes incompatibly, so the extension can ask for an update. */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Chrome refuses messages over 1 MiB from a native host. */
export const MAX_HOST_MESSAGE_BYTES = 1024 * 1024;

/** Agents usually answer in under a minute; large pages and slow models need more. */
export const DEFAULT_AGENT_TIMEOUT_MS = 180_000;
export const MAX_AGENT_TIMEOUT_MS = 600_000;

export const AGENT_IDS = ["claude-code", "codex", "gemini", "antigravity"] as const;
export const agentIdSchema = z.enum(AGENT_IDS);
export type AgentId = z.infer<typeof agentIdSchema>;

/** "cli": the CLI's own sign-in, set up by the user. "api-key": a key from the OS keychain. */
export const agentAuthSchema = z.enum(["cli", "api-key"]);
export type AgentAuth = z.infer<typeof agentAuthSchema>;

/** Passed to the agent as a command-line argument, so only plain model-name characters. */
export const AGENT_MODEL_PATTERN = /^[A-Za-z0-9._:/@+-]{1,200}$/;

const chatMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const requestId = z.string().min(1).max(64);

export const bridgeRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("hello"), id: requestId }),
  z.strictObject({
    type: z.literal("generate"),
    id: requestId,
    agent: agentIdSchema,
    auth: agentAuthSchema,
    model: z.string().regex(AGENT_MODEL_PATTERN).optional(),
    prompt: z.strictObject({ system: z.string(), messages: z.array(chatMessageSchema).min(1) }),
    responseSchema: z.record(z.string(), z.unknown()).optional(),
    timeoutMs: z.number().int().min(1_000).max(MAX_AGENT_TIMEOUT_MS).optional(),
  }),
  z.strictObject({ type: z.literal("cancel"), id: requestId, target: requestId }),
  z.strictObject({
    type: z.literal("setKey"),
    id: requestId,
    agent: agentIdSchema,
    key: z.string().min(1).max(4096),
  }),
  z.strictObject({ type: z.literal("deleteKey"), id: requestId, agent: agentIdSchema }),
  // M5: keep this host running as the link agents reach through `claymod-bridge mcp`.
  z.strictObject({ type: z.literal("serve"), id: requestId }),
  z.strictObject({
    type: z.literal("agentResult"),
    id: requestId,
    callId: requestId,
    result: agentResultSchema,
  }),
]);
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeRequestType = BridgeRequest["type"];

export const agentStatusSchema = z.strictObject({
  id: agentIdSchema,
  /** Found on the PATH the bridge uses. */
  found: z.boolean(),
  path: z.string().optional(),
  /** An API key is stored in the OS keychain for this agent. */
  keyStored: z.boolean(),
});
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const helloResultSchema = z.strictObject({
  bridgeVersion: z.string(),
  protocolVersion: z.number().int(),
  agents: z.array(agentStatusSchema),
  /** False when the OS keychain can't be used, so API keys must come from the environment. */
  keychain: z.boolean(),
});
export type HelloResult = z.infer<typeof helloResultSchema>;

export const generateResultSchema = z.strictObject({
  text: z.string(),
  model: z.string(),
});
export type GenerateResult = z.infer<typeof generateResultSchema>;

export const serveResultSchema = z.strictObject({ socket: z.string() });

export const BRIDGE_ERROR_KINDS = [
  "bad-request",
  "agent-not-found",
  "auth",
  "timeout",
  "cancelled",
  "agent-failed",
  "too-large",
  "keychain",
  "link",
] as const;
export const bridgeErrorSchema = z.strictObject({
  kind: z.enum(BRIDGE_ERROR_KINDS),
  /** Shown to the user; says what to do next. */
  message: z.string(),
});
export type BridgeError = z.infer<typeof bridgeErrorSchema>;

export const bridgeResponseSchema = z.union([
  z.strictObject({ id: z.string(), ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ id: z.string(), ok: z.literal(false), error: bridgeErrorSchema }),
]);
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;

/** The executable each agent is started as (looked up on PATH by the bridge). */
export const AGENT_COMMANDS: Record<AgentId, string> = {
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  antigravity: "agy",
};

/** Vendors that restrict third-party use of their CLI's own sign-in (see ADR 0004). */
export const SIGN_IN_RISK_AGENTS: readonly AgentId[] = ["gemini", "antigravity"];

export const AGENT_LABELS: Record<AgentId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  antigravity: "Antigravity CLI",
};
