import type { RpcHandlers } from "@/lib/rpc/server";
import { setAgentAccess } from "@/lib/storage";
import { syncAgentLink } from "./agent-link";
import { decide, listRequests } from "./agent-requests";

/** Waits briefly for the bridge to answer "serve", so settings can show the real state. */
async function settledStatus() {
  let status = await syncAgentLink();
  for (let i = 0; i < 20 && status.state === "connecting"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    status = await syncAgentLink();
  }
  return status;
}

export const agentHandlers: Pick<
  RpcHandlers,
  "agentAccess" | "setAgentAccess" | "agentRequests" | "agentDecision"
> = {
  agentAccess: async () => ({ ok: true, value: await settledStatus() }),
  setAgentAccess: async ({ enabled }) => {
    await setAgentAccess(enabled);
    return { ok: true, value: await settledStatus() };
  },
  agentRequests: async () => ({ ok: true, value: listRequests() }),
  agentDecision: async ({ requestId, outcome }) =>
    decide(requestId, outcome)
      ? { ok: true, value: null }
      : { ok: false, error: "The agent stopped waiting for this request." },
};
