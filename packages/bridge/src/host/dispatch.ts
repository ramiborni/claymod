import {
  type AgentId,
  type AgentStatus,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeError,
  type BridgeRequest,
  type BridgeResponse,
  bridgeRequestSchema,
  DEFAULT_AGENT_TIMEOUT_MS,
  type HelloResult,
} from "@claymod/core/bridge-protocol";
import { KEYCHAIN_HELP } from "../keys";
import { type AgentDeps, agentSearchPath, runAgent } from "../runners/run-agent";
import type { AgentRunner } from "../runners/types";

export interface DispatchDeps {
  agents: AgentDeps;
  runners: Record<AgentId, AgentRunner>;
  version: string;
}

export type Dispatch = (raw: unknown, hostSignal: AbortSignal) => Promise<BridgeResponse>;

const BAD_REQUEST: BridgeError = {
  kind: "bad-request",
  message:
    "The bridge didn't understand Claymod's request. Update claymod-bridge and the extension to their latest versions.",
};

const done = (id: string, value: unknown): BridgeResponse => ({ id, ok: true, value });
const failed = (id: string, error: BridgeError): BridgeResponse => ({ id, ok: false, error });

function idOf(raw: unknown): string {
  if (typeof raw !== "object" || raw === null || !("id" in raw)) return "";
  return typeof raw.id === "string" ? raw.id.slice(0, 64) : "";
}

async function hello(deps: DispatchDeps): Promise<HelloResult> {
  const path = agentSearchPath(deps.agents);
  const keychain = await deps.agents.keys.available();
  const agents: AgentStatus[] = [];
  for (const runner of Object.values(deps.runners)) {
    const found = deps.agents.which(runner.command, path);
    const key = keychain ? await deps.agents.keys.get(runner.id).catch(() => undefined) : undefined;
    agents.push({
      id: runner.id,
      found: Boolean(found),
      ...(found ? { path: found } : {}),
      keyStored: Boolean(key),
    });
  }
  return {
    bridgeVersion: deps.version,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    agents,
    keychain,
  };
}

/** Handles one request at a time per id; generate calls can run side by side and be cancelled. */
export function createDispatcher(deps: DispatchDeps): Dispatch {
  const inFlight = new Map<string, AbortController>();

  async function generate(
    request: Extract<BridgeRequest, { type: "generate" }>,
    hostSignal: AbortSignal,
  ): Promise<BridgeResponse> {
    const controller = new AbortController();
    const onHostAbort = () => controller.abort();
    hostSignal.addEventListener("abort", onHostAbort, { once: true });
    inFlight.set(request.id, controller);
    try {
      const result = await runAgent(
        deps.runners[request.agent],
        {
          prompt: request.prompt,
          responseSchema: request.responseSchema,
          model: request.model,
          auth: request.auth,
          timeoutMs: request.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
        },
        deps.agents,
        controller.signal,
      );
      return result.ok ? done(request.id, result.value) : failed(request.id, result.error);
    } finally {
      inFlight.delete(request.id);
      hostSignal.removeEventListener("abort", onHostAbort);
    }
  }

  async function keyChange(id: string, change: () => Promise<unknown>): Promise<BridgeResponse> {
    try {
      await change();
      return done(id, null);
    } catch {
      return failed(id, { kind: "keychain", message: KEYCHAIN_HELP });
    }
  }

  return async (raw, hostSignal) => {
    const parsed = bridgeRequestSchema.safeParse(raw);
    if (!parsed.success) return failed(idOf(raw), BAD_REQUEST);
    const request = parsed.data;
    switch (request.type) {
      case "hello":
        return done(request.id, await hello(deps));
      case "generate":
        return generate(request, hostSignal);
      case "cancel":
        inFlight.get(request.target)?.abort();
        return done(request.id, null);
      case "setKey":
        return keyChange(request.id, () => deps.agents.keys.set(request.agent, request.key));
      case "deleteKey":
        return keyChange(request.id, () => deps.agents.keys.delete(request.agent));
    }
  };
}
