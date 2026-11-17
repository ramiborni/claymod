import "@/lib/ui/theme.css";
import "@/lib/ui/panel.css";
import { useJitlessZod } from "@claymod/core/zod-config";
import { AGENT_REQUESTS_KEY } from "@/lib/agent-keys";
import { createRpcClient } from "@/lib/rpc/client";
import { KEYS } from "@/lib/storage";
import type { PanelContext } from "./context";
import { createActions } from "./create-actions";
import { managerActions } from "./manager-actions";
import { initialState, type PanelState } from "./state";
import { targetTabId } from "./target-tab";
import { renderPanel } from "./views";

useJitlessZod();
const rpc = createRpcClient();
const content = document.getElementById("content") as HTMLElement;
const providerLabel = document.getElementById("provider") as HTMLElement;
let state: PanelState = initialState;

/** Re-rendering replaces the field; keep focus and the caret where the user left them. */
function keepFocus(render: () => void) {
  const field = document.activeElement as HTMLTextAreaElement | null;
  const focused =
    field?.id === "request" ? { start: field.selectionStart, end: field.selectionEnd } : null;
  render();
  if (!focused) return;
  const next = document.getElementById("request") as HTMLTextAreaElement | null;
  next?.focus();
  next?.setSelectionRange(focused.start, focused.end);
}

const ctx: PanelContext = {
  rpc,
  get: () => state,
  update(patch) {
    state = { ...state, ...patch };
    keepFocus(render);
  },
  async refreshMods() {
    const result = await rpc.call("listMods", { tabId: await targetTabId() });
    if (result.ok) ctx.update({ manager: { ...state.manager, view: result.value } });
  },
};

const create = createActions(ctx);
const manager = managerActions(ctx, create.startRepair);

function render() {
  providerLabel.textContent = state.provider.label || "No provider";
  content.replaceChildren(...renderPanel(state, create, manager));
}

async function refreshProvider() {
  const status = await rpc.call("status", {});
  if (status.ok) ctx.update({ provider: status.value });
}

async function refreshAgentRequests() {
  const requests = await rpc.call("agentRequests", {});
  if (requests.ok) ctx.update({ agentRequests: requests.value });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && AGENT_REQUESTS_KEY in changes) void refreshAgentRequests();
  if (area !== "local") return;
  if (KEYS.provider in changes) void refreshProvider();
  if (KEYS.mods in changes || KEYS.modState in changes || KEYS.pausedSites in changes)
    void ctx.refreshMods();
});
browser.tabs.onActivated.addListener(() => void ctx.refreshMods());
(document.getElementById("app") as HTMLElement).hidden = false;
render();
void refreshProvider();
void ctx.refreshMods();
void refreshAgentRequests();
