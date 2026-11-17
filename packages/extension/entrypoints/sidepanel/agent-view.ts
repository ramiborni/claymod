import type { AgentRequestView } from "@/lib/rpc/protocol";
import { h } from "@/lib/ui/dom";

export interface AgentRequestActions {
  reviewAgentRequest(request: AgentRequestView): void;
  declineAgentRequest(request: AgentRequestView): void;
}

function requestCard(request: AgentRequestView, actions: AgentRequestActions): Node {
  const { draft } = request;
  const asks =
    request.tool === "save_mod"
      ? request.replaces
        ? `wants to update “${request.replaces.name}”`
        : "wants to save a mod"
      : "wants to preview a mod";
  return h(
    "div",
    {
      class: "card stack",
      "data-testid": "agent-request",
      role: "group",
      "aria-label": `${request.client} ${asks}`,
    },
    h("p", { class: "muted small" }, h("strong", {}, request.client), ` ${asks}`),
    h("h2", {}, draft.name),
    h("p", {}, draft.description),
    h("p", { class: "muted small" }, `Runs on: ${draft.matches.join(", ")}`),
    draft.js?.trim() &&
      h(
        "p",
        { class: "muted small" },
        "Includes JavaScript. You'll see the code before keeping it.",
      ),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { class: "primary", onclick: () => actions.reviewAgentRequest(request) },
        "Preview",
      ),
      h("button", { onclick: () => actions.declineAgentRequest(request) }, "Decline"),
    ),
  );
}

/** Agent proposals, newest last, shown above the Create screen until the user decides. */
export function renderAgentRequests(
  requests: AgentRequestView[],
  actions: AgentRequestActions,
  hiddenRequestId?: string,
): Node | false {
  const shown = requests.filter((request) => request.id !== hiddenRequestId);
  return (
    shown.length > 0 &&
    h(
      "section",
      { class: "stack", "aria-label": "Requests from agents" },
      ...shown.map((r) => requestCard(r, actions)),
    )
  );
}
