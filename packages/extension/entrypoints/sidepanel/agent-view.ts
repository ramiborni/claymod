import type { AgentRequestView } from "@/lib/rpc/protocol";
import { h } from "@/lib/ui/dom";

export interface AgentRequestActions {
  reviewAgentRequest(request: AgentRequestView): void;
  declineAgentRequest(request: AgentRequestView): void;
}

function requestRow(request: AgentRequestView, actions: AgentRequestActions): Node {
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
      class: "need",
      "data-testid": "agent-request",
      role: "group",
      "aria-label": `${request.client} ${asks}`,
    },
    h("span", { class: "who" }, h("span", {}, h("strong", {}, request.client), ` ${asks}`)),
    h("h3", {}, draft.name),
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
        { class: "sm primary", onclick: () => actions.reviewAgentRequest(request) },
        "Preview",
      ),
      h("button", { class: "sm", onclick: () => actions.declineAgentRequest(request) }, "Decline"),
    ),
  );
}

/** What's waiting for the user (agent proposals), between the command and the site. */
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
      { class: "needs", "aria-label": "Waiting for you" },
      ...shown.map((request) => requestRow(request, actions)),
    )
  );
}
