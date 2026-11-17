import { h } from "@/lib/ui/dom";
import { type AgentRequestActions, renderAgentRequests } from "./agent-view";
import { type CommandActions, command, ideas, working } from "./command-view";
import { type ManagerActions, renderSite } from "./manager-view";
import { type ResultActions, result } from "./result-view";
import type { PanelState } from "./state";

export interface CreateActions extends CommandActions, ResultActions, AgentRequestActions {}

function footer(state: PanelState, create: CreateActions, manager: ManagerActions): Node {
  const all = state.manager.filter === "all";
  const total = state.manager.view?.mods.length ?? 0;
  return h(
    "footer",
    { class: "foot" },
    h(
      "button",
      {
        class: "link",
        "aria-pressed": String(all),
        onclick: () => manager.setFilter(all ? "site" : "all"),
      },
      all ? "This site" : `All sites · ${total} mod${total === 1 ? "" : "s"}`,
    ),
    h(
      "span",
      { class: "row" },
      h("button", { class: "link", onclick: manager.openImport }, "Import…"),
      h(
        "button",
        { class: "link", onclick: () => manager.exportMods(), disabled: total === 0 },
        "Export all",
      ),
      h("button", { class: "link", id: "settings", onclick: create.openSettings }, "Settings"),
    ),
  );
}

/** Layout G: the command on top, then work in progress or the result, what's waiting, the site. */
export function renderPanel(
  state: PanelState,
  create: CreateActions,
  manager: ManagerActions,
): Node[] {
  const screen = state.screen;
  const reviewing =
    screen.name === "preview" && screen.purpose.kind === "agent"
      ? screen.purpose.requestId
      : undefined;
  const busy =
    screen.name === "generating" || screen.name === "picking" || screen.name === "preview";
  return [
    command(state, create),
    ideas(state, create),
    screen.name === "preview" ? result(screen, state, create) : working(state, create),
    renderAgentRequests(state.agentRequests, create, reviewing),
    renderSite(state.manager, manager, busy),
    footer(state, create, manager),
  ].filter((node): node is Node => node !== false);
}
