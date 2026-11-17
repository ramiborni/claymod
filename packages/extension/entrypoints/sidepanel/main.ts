import "@/lib/ui/theme.css";
import { useJitlessZod } from "@claymod/core/zod-config";
import { AGENT_REQUESTS_KEY } from "@/lib/agent-keys";
import { createRpcClient } from "@/lib/rpc/client";
import { KEYS } from "@/lib/storage";
import { h } from "@/lib/ui/dom";
import type { PanelContext } from "./context";
import { createActions } from "./create-actions";
import { managerActions } from "./manager-actions";
import { renderManager } from "./manager-view";
import { initialState, type PanelState, type Tab } from "./state";
import { targetTabId } from "./target-tab";
import { renderCreate } from "./views";

useJitlessZod();
const rpc = createRpcClient();
const content = document.getElementById("content") as HTMLElement;
const providerLabel = document.getElementById("provider") as HTMLElement;
const tabs = document.getElementById("tabs") as HTMLElement;
let state: PanelState = initialState;

const ctx: PanelContext = {
  rpc,
  get: () => state,
  update(patch) {
    const focusedId = document.activeElement?.id;
    state = { ...state, ...patch };
    render();
    if (focusedId === "request") document.getElementById("request")?.focus();
  },
  async refreshMods() {
    const result = await rpc.call("listMods", { tabId: await targetTabId() });
    if (result.ok) ctx.update({ manager: { ...state.manager, view: result.value } });
  },
};

const create = createActions(ctx);
const manager = managerActions(ctx, create.startRepair);

function tabButton(tab: Tab, label: string) {
  return h(
    "button",
    {
      role: "tab",
      "aria-selected": String(state.tab === tab),
      onclick: () => {
        ctx.update({ tab });
        if (tab === "mods") void ctx.refreshMods();
      },
    },
    label,
  );
}

function render() {
  providerLabel.textContent = state.provider.label || "No provider";
  const repairs =
    state.manager.view?.mods.filter((mod) => mod.health === "needs-repair" && mod.appliesHere)
      .length ?? 0;
  tabs.replaceChildren(
    tabButton("create", "Create"),
    tabButton(
      "mods",
      repairs ? `Mods (${repairs} ${repairs === 1 ? "needs" : "need"} repair)` : "Mods",
    ),
  );
  content.replaceChildren(
    state.tab === "create" ? renderCreate(state, create) : renderManager(state.manager, manager),
  );
}

async function refreshProvider() {
  const status = await rpc.call("status", {});
  if (status.ok) ctx.update({ provider: status.value });
}

async function refreshAgentRequests() {
  const requests = await rpc.call("agentRequests", {});
  if (requests.ok) ctx.update({ agentRequests: requests.value });
}

document.getElementById("settings")?.addEventListener("click", create.openSettings);
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
