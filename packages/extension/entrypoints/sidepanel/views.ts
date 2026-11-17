import { isBroadPattern } from "@/lib/origins";
import { h } from "@/lib/ui/dom";
import type { PanelState, PreviewScreen } from "./state";

export interface CreateActions {
  setRequest(value: string): void;
  pick(): void;
  cancelPick(): void;
  clearPicked(): void;
  generate(): void;
  cancelGenerate(): void;
  save(): void;
  discard(): void;
  toggleCode(): void;
  backToCompose(): void;
  openSettings(): void;
}

function compose(state: PanelState, actions: CreateActions): Node {
  const canGenerate = state.provider.configured && state.request.trim().length > 0;
  return h(
    "div",
    { class: "stack" },
    !state.provider.configured &&
      h(
        "div",
        { class: "notice warn" },
        "Choose a model provider to start. ",
        h("button", { class: "link", onclick: actions.openSettings }, "Open settings"),
      ),
    h(
      "label",
      {},
      "What do you want to change?",
      h(
        "textarea",
        {
          id: "request",
          placeholder: "e.g. Hide the promoted posts and make the text bigger",
          oninput: (event: Event) =>
            actions.setRequest((event.target as HTMLTextAreaElement).value),
        },
        state.request,
      ),
    ),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { onclick: actions.pick },
        state.picked ? "Pick another element" : "Pick element",
      ),
      state.picked &&
        h(
          "span",
          { class: "chip", "data-testid": "picked" },
          h("span", { title: state.picked.selector }, state.picked.selector),
          h("button", { "aria-label": "Clear picked element", onclick: actions.clearPicked }, "×"),
        ),
    ),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { class: "primary", id: "generate", disabled: !canGenerate, onclick: actions.generate },
        "Generate",
      ),
    ),
  );
}

export function codeView(css: string | undefined, js: string | undefined): Node {
  return h(
    "div",
    { class: "stack", "data-testid": "code" },
    css && h("div", {}, h("p", { class: "muted" }, "CSS"), h("pre", {}, css)),
    js &&
      h(
        "div",
        {},
        h("p", { class: "muted" }, "JavaScript (runs in an isolated user-script world)"),
        h("pre", {}, js),
      ),
  );
}

function preview(screen: PreviewScreen, state: PanelState, actions: CreateActions): Node {
  const { draft } = screen.generated;
  const repairing = screen.purpose.kind === "repair";
  const saveLabel = repairing ? "Save repair" : "Keep";
  return h(
    "div",
    { class: "card", "data-testid": "preview" },
    repairing &&
      h(
        "p",
        { class: "muted" },
        `Repaired version of “${screen.purpose.kind === "repair" ? screen.purpose.modName : ""}”`,
      ),
    h("h2", {}, draft.name),
    h("p", {}, draft.description),
    h("p", { class: "muted" }, "Previewing on this tab only. Runs on:"),
    h("ul", {}, ...draft.matches.map((pattern) => h("li", {}, h("code", {}, pattern)))),
    draft.matches.some(isBroadPattern) &&
      h(
        "div",
        { class: "notice warn" },
        "This mod asks to run on every website. Keep it only if that's what you want.",
      ),
    screen.preview.js === "ran" &&
      h(
        "p",
        { class: "muted" },
        "This mod includes JavaScript. Discard reloads the page to undo it.",
      ),
    screen.preview.js === "unavailable" &&
      h(
        "div",
        { class: "notice warn" },
        `This mod includes JavaScript, which wasn't previewed. ${screen.preview.jsHelp ?? ""}`,
      ),
    state.saveError && h("div", { class: "notice error", role: "alert" }, state.saveError),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { class: "primary", disabled: screen.saving, onclick: actions.save },
        screen.saving ? "Saving…" : saveLabel,
      ),
      h("button", { disabled: screen.saving, onclick: actions.discard }, "Discard"),
      h(
        "button",
        { class: "link", "aria-expanded": String(screen.showCode), onclick: actions.toggleCode },
        screen.showCode ? "Hide code" : "View code",
      ),
    ),
    screen.showCode && codeView(draft.css, draft.js),
  );
}

function busy(text: string, cancel: () => void): Node {
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "row" },
      h("div", { class: "spinner", "aria-hidden": "true" }),
      h("p", { role: "status" }, text),
    ),
    h("div", { class: "row" }, h("button", { onclick: cancel }, "Cancel")),
  );
}

export function renderCreate(state: PanelState, actions: CreateActions): Node {
  const screen = state.screen;
  switch (screen.name) {
    case "compose":
      return compose(state, actions);
    case "picking":
      return busy("Click an element on the page. Press Esc to cancel.", actions.cancelPick);
    case "generating":
      return busy(screen.label, actions.cancelGenerate);
    case "preview":
      return preview(screen, state, actions);
    case "saved":
      return h(
        "div",
        { class: "stack" },
        h("div", { class: "notice ok", role: "status" }, screen.message),
        h(
          "div",
          { class: "row" },
          h("button", { onclick: actions.backToCompose }, "Make another change"),
        ),
      );
    case "error":
      return h(
        "div",
        { class: "stack" },
        h("div", { class: "notice error", role: "alert" }, screen.message),
        h("div", { class: "row" }, h("button", { onclick: actions.backToCompose }, "Back")),
      );
  }
}
