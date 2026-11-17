import { AGENT_STATUS_KEY } from "@/lib/agent-keys";
import type { createRpcClient } from "@/lib/rpc/client";
import type { AgentLinkStatus } from "@/lib/rpc/protocol";
import { allowLocalApps } from "./local-agent";

type Rpc = ReturnType<typeof createRpcClient>;

const MESSAGES: Record<AgentLinkStatus["state"], string> = {
  off: "",
  connecting: "Connecting to claymod-bridge…",
  connected: "Agents can reach Claymod. You'll approve every preview and save in the side panel.",
  error: "",
};

/** The "Agents (MCP)" switch: opens or closes the link to claymod-bridge for MCP agents. */
export function setUpAgentsSection(rpc: Rpc): void {
  const toggle = document.getElementById("agent-access") as HTMLInputElement;
  const status = document.getElementById("agent-status") as HTMLElement;

  const show = (value: AgentLinkStatus) => {
    toggle.checked = value.enabled;
    const text = value.state === "error" ? (value.error ?? "") : MESSAGES[value.state];
    status.hidden = !text;
    status.textContent = text;
    status.className = `notice ${value.state === "connected" ? "ok" : value.state === "error" ? "error" : "warn"}`;
    if (value.state === "error")
      (document.getElementById("agent-setup") as HTMLDetailsElement).open = true;
  };
  const showError = (message: string) =>
    show({ enabled: toggle.checked, state: "error", error: message });

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    if (enabled && !(await allowLocalApps(showError))) {
      toggle.checked = false;
      return;
    }
    const result = await rpc.call("setAgentAccess", { enabled });
    if (result.ok) show(result.value);
    else showError(result.error);
  });
  browser.storage.onChanged.addListener((changes, area) => {
    const next = changes[AGENT_STATUS_KEY]?.newValue as AgentLinkStatus | undefined;
    if (area === "session" && next) show(next);
  });
  void rpc.call("agentAccess", {}).then((result) => result.ok && show(result.value));
}
