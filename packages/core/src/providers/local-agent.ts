import {
  AGENT_LABELS,
  type AgentAuth,
  type AgentId,
  type BridgeError,
  type BridgeRequest,
  generateResultSchema,
} from "../bridge/protocol";
import { err, ok, type Result } from "../result";
import type { ModelProvider, ProviderError, ProviderErrorKind } from "./types";

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type BridgeCall = WithoutId<BridgeRequest>;

/**
 * Sends one request to claymod-bridge and resolves with its value. The extension implements it
 * with chrome.runtime.connectNative; errors are already user-facing (they say what to do next).
 */
export type BridgeTransport = (
  request: BridgeCall,
  signal?: AbortSignal,
) => Promise<Result<unknown, ProviderError>>;

export interface LocalAgentConfig {
  agent: AgentId;
  auth: AgentAuth;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  bridge?: BridgeTransport | undefined;
}

const KIND_BY_BRIDGE_ERROR: Record<BridgeError["kind"], ProviderErrorKind> = {
  "bad-request": "bad-request",
  "agent-not-found": "not-found",
  auth: "auth",
  timeout: "network",
  cancelled: "network",
  "agent-failed": "server",
  "too-large": "truncated",
  keychain: "auth",
  link: "network",
};

export function fromBridgeError(error: BridgeError): ProviderError {
  return { kind: KIND_BY_BRIDGE_ERROR[error.kind], message: error.message };
}

const NO_BRIDGE: ProviderError = {
  kind: "network",
  message:
    "Local agents need claymod-bridge. Open Claymod settings, choose Local agent and follow the setup steps.",
};

/** A local agent CLI (Claude Code, Codex, …) reached through claymod-bridge. */
export function createLocalAgentProvider(config: LocalAgentConfig): ModelProvider {
  const model = config.model || `${AGENT_LABELS[config.agent]} default`;
  return {
    id: `local-agent:${config.agent}`,
    model,
    async complete(request) {
      if (!config.bridge) return err(NO_BRIDGE);
      const result = await config.bridge(
        {
          type: "generate",
          agent: config.agent,
          auth: config.auth,
          prompt: { system: request.system, messages: request.messages },
          ...(config.model ? { model: config.model } : {}),
          ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
          ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
        },
        request.signal,
      );
      if (!result.ok) return result;
      const parsed = generateResultSchema.safeParse(result.value);
      if (!parsed.success) {
        return err({
          kind: "invalid-response",
          message:
            "claymod-bridge sent an answer Claymod doesn't understand. Update the bridge and the extension to the same version.",
        });
      }
      return ok(parsed.data);
    },
  };
}
