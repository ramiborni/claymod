import type { AgentId } from "@claymod/core/bridge-protocol";
import { installCommand } from "@/lib/bridge-errors";
import type { createRpcClient } from "@/lib/rpc/client";
import { hasSignInRisk } from "./form";

type Show = (kind: "ok" | "error" | "info", message: string) => void;

/**
 * Asks for "nativeMessaging" the first time a local agent is used. Must run from a click:
 * Chrome only shows permission prompts for a user gesture.
 */
export async function allowLocalApps(show: Show): Promise<boolean> {
  const granted = await browser.permissions.request({ permissions: ["nativeMessaging"] });
  if (!granted) {
    show(
      "error",
      "Claymod needs permission to talk to local apps to use claymod-bridge. Try again and click Allow.",
    );
  }
  return granted;
}

/** Shows the risk notice and the key field only where they apply. */
export function syncLocalAgent(form: HTMLFormElement, agent: AgentId, auth: string): void {
  const risk = form.querySelector<HTMLElement>("[data-testid=sign-in-risk]");
  if (risk) risk.hidden = !(auth === "cli" && hasSignInRisk(agent));
  for (const element of form.querySelectorAll<HTMLElement>("[data-auth]")) {
    element.hidden = element.dataset.auth !== auth;
  }
}

/** Wires the setup steps and the keychain buttons of the Local agent section. */
export function setUpLocalAgent(options: {
  form: HTMLFormElement;
  rpc: ReturnType<typeof createRpcClient>;
  show: Show;
  agent: () => AgentId;
}): void {
  const { form, rpc, show } = options;
  const command = installCommand(browser.runtime.id);
  const commandElement = document.getElementById("install-command");
  if (commandElement) commandElement.textContent = command;
  document.getElementById("copy-install")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(command).catch(() => {});
    show("ok", "Copied. Paste it into a terminal.");
  });

  const keyInput = form.elements.namedItem("agentKey") as HTMLInputElement;
  document.getElementById("save-agent-key")?.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) return show("error", "Paste the agent's API key first.");
    if (!(await allowLocalApps(show))) return;
    show("info", "Saving to the system keychain…");
    const result = await rpc.call("bridgeSetKey", { agent: options.agent(), key });
    if (!result.ok) return show("error", result.error);
    keyInput.value = "";
    show("ok", "Saved in your system keychain. Claymod kept no copy.");
  });
  document.getElementById("delete-agent-key")?.addEventListener("click", async () => {
    if (!(await allowLocalApps(show))) return;
    const result = await rpc.call("bridgeDeleteKey", { agent: options.agent() });
    show(result.ok ? "ok" : "error", result.ok ? "Deleted the saved key." : result.error);
  });
}
