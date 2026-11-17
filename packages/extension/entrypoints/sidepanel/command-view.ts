import { h } from "@/lib/ui/dom";
import type { PanelState } from "./state";

export interface CommandActions {
  setRequest(value: string): void;
  useIdea(text: string): void;
  pick(): void;
  cancelPick(): void;
  clearPicked(): void;
  generate(): void;
  cancelGenerate(): void;
  backToCompose(): void;
  openSettings(): void;
}

/** Fixed starting points. They fill the field; nothing is sent until the user generates. */
export const IDEAS = [
  "Hide the cookie banner",
  "Make the text bigger",
  "Hide the sidebar",
  "Dark mode for this site",
];

const busyScreens = new Set(["picking", "generating"]);

function onKey(actions: CommandActions) {
  return (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.key !== "Enter" || key.shiftKey || key.isComposing) return;
    event.preventDefault();
    const button = document.getElementById("generate") as HTMLButtonElement | null;
    if (button && !button.disabled) actions.generate();
  };
}

/** The big field on top: what to change, an optional picked element, and Generate. */
export function command(state: PanelState, actions: CommandActions): Node {
  const busy = busyScreens.has(state.screen.name);
  const canGenerate = state.provider.configured && state.request.trim().length > 0 && !busy;
  return h(
    "section",
    {
      class: state.request.trim() ? "command ready" : "command",
      "aria-label": "Describe a change",
    },
    h("label", { class: "visually-hidden", for: "request" }, "What do you want to change?"),
    h(
      "textarea",
      {
        id: "request",
        rows: "2",
        placeholder: "What should change on this page?",
        oninput: (event: Event) => actions.setRequest((event.target as HTMLTextAreaElement).value),
        onkeydown: onKey(actions),
      },
      state.request,
    ),
    state.picked &&
      h(
        "div",
        { class: "row" },
        h(
          "span",
          { class: "chip", "data-testid": "picked" },
          h("span", { title: state.picked.selector }, state.picked.selector),
          h("button", { "aria-label": "Clear picked element", onclick: actions.clearPicked }, "×"),
        ),
      ),
    h(
      "div",
      { class: "command-actions" },
      h(
        "button",
        { class: "sm", onclick: actions.pick, disabled: busy },
        state.picked ? "Pick another element" : "Pick element",
      ),
      h("span", { class: "spacer" }),
      h(
        "button",
        { class: "sm primary", id: "generate", disabled: !canGenerate, onclick: actions.generate },
        "Generate",
      ),
    ),
  );
}

export function ideas(state: PanelState, actions: CommandActions): Node | false {
  if (state.screen.name !== "compose" || state.request.trim() || !state.provider.configured) {
    return false;
  }
  return h(
    "div",
    { class: "tries", role: "group", "aria-label": "Ideas to start from" },
    ...IDEAS.map((idea) =>
      h("button", { class: "try", onclick: () => actions.useIdea(idea) }, idea),
    ),
  );
}

const tick = () => h("span", { class: "tick", "aria-hidden": "true" });

type StepState = "done" | "active" | "waiting";
const step = (state: StepState, text: string) =>
  h(
    "li",
    { class: "step" },
    state === "done"
      ? tick()
      : state === "active"
        ? h("span", { class: "spinner", "aria-hidden": "true" })
        : h("span", { class: "wait", "aria-hidden": "true" }),
    h("span", state === "active" ? { role: "status" } : {}, text),
  );

/** What happens between the words and the result, shown as honest steps. */
export function working(state: PanelState, actions: CommandActions): Node | false {
  const screen = state.screen;
  if (screen.name === "picking") {
    return h(
      "div",
      { class: "work" },
      h(
        "ul",
        { class: "steps" },
        step("active", "Click an element on the page. Press Esc to cancel."),
      ),
      h(
        "div",
        { class: "row" },
        h("button", { class: "sm", onclick: actions.cancelPick }, "Cancel"),
      ),
    );
  }
  if (screen.name === "generating") {
    const writing = screen.stage === "writing";
    return h(
      "div",
      { class: "work" },
      h(
        "ul",
        { class: "steps" },
        step(writing ? "active" : "done", writing ? screen.label : "Wrote the mod"),
        step(writing ? "waiting" : "active", "Preview on this tab"),
      ),
      h(
        "div",
        { class: "row" },
        h("button", { class: "sm", onclick: actions.cancelGenerate }, "Cancel"),
      ),
    );
  }
  if (screen.name === "saved") {
    return h(
      "div",
      { class: "work" },
      h("div", { class: "notice ok", role: "status" }, screen.message),
      h(
        "div",
        { class: "row" },
        h("button", { class: "sm", onclick: actions.backToCompose }, "Make another change"),
      ),
    );
  }
  if (screen.name === "error") {
    return h(
      "div",
      { class: "work" },
      h("div", { class: "notice error", role: "alert" }, screen.message),
      h(
        "div",
        { class: "row" },
        h("button", { class: "sm", onclick: actions.backToCompose }, "Back"),
      ),
    );
  }
  if (!state.provider.configured) {
    return h(
      "div",
      { class: "work" },
      h(
        "div",
        { class: "notice warn" },
        "Choose a model provider to start. ",
        h("button", { class: "link", onclick: actions.openSettings }, "Open settings"),
      ),
    );
  }
  return false;
}
