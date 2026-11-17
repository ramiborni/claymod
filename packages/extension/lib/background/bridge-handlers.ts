import {
  AGENT_COMMANDS,
  AGENT_LABELS,
  BRIDGE_PROTOCOL_VERSION,
  type HelloResult,
  helloResultSchema,
  type ProviderConfig,
  testConnection,
} from "@claymod/core";
import { installCommand, outdatedBridge } from "@/lib/bridge-errors";
import type { RpcResult } from "@/lib/rpc/protocol";
import type { RpcHandlers } from "@/lib/rpc/server";
import { nativeBridge } from "./bridge";
import { providerFor } from "./provider";

type LocalAgentConfig = Extract<ProviderConfig, { kind: "local-agent" }>;

async function hello(signal: AbortSignal): Promise<RpcResult<HelloResult>> {
  const result = await nativeBridge({ type: "hello" }, signal);
  if (!result.ok) return { ok: false, error: result.error.message };
  const parsed = helloResultSchema.safeParse(result.value);
  if (!parsed.success || parsed.data.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
    const version = parsed.success ? parsed.data.bridgeVersion : "(unknown version)";
    return { ok: false, error: outdatedBridge(version) };
  }
  return { ok: true, value: parsed.data };
}

/** Checks the bridge and the agent before spending a model call, so errors say what to fix. */
export async function testLocalAgent(
  config: LocalAgentConfig,
  signal: AbortSignal,
): Promise<RpcResult<{ model: string }>> {
  const bridge = await hello(signal);
  if (!bridge.ok) return bridge;
  const label = AGENT_LABELS[config.agent];
  if (!bridge.value.agents.find((agent) => agent.id === config.agent)?.found) {
    return {
      ok: false,
      error: `claymod-bridge can't find ${label} ('${AGENT_COMMANDS[config.agent]}'). Install it, then run '${installCommand(browser.runtime.id)}' from a terminal where '${AGENT_COMMANDS[config.agent]}' works.`,
    };
  }
  const result = await testConnection(providerFor(config), signal);
  return result.ok ? result : { ok: false, error: result.error.message };
}

const done = (result: Awaited<ReturnType<typeof nativeBridge>>): RpcResult<null> =>
  result.ok ? { ok: true, value: null } : { ok: false, error: result.error.message };

export const bridgeHandlers: Pick<RpcHandlers, "bridgeHello" | "bridgeSetKey" | "bridgeDeleteKey"> =
  {
    bridgeHello: (_payload, signal) => hello(signal),
    bridgeSetKey: async ({ agent, key }, signal) =>
      done(await nativeBridge({ type: "setKey", agent, key: key.trim() }, signal)),
    bridgeDeleteKey: async ({ agent }, signal) =>
      done(await nativeBridge({ type: "deleteKey", agent }, signal)),
  };
