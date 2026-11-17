import { isBroadPattern } from "@/lib/origins";
import { h } from "@/lib/ui/dom";
import type { PanelState, Screen } from "./state";

export interface Actions {
  setRequest(value: string): void;
  pick(): void;
  cancelPick(): void;
  clearPicked(): void;
  generate(): void;
  cancelGenerate(): void;
  keep(): void;
  discard(): void;
  toggleCode(): void;
  backToCompose(): void;
  openSettings(): void;
}

function compose(state: PanelState, actions: Actions): Node {
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
        { class: "primary", disabled: !canGenerate, onclick: actions.generate },
        "Generate",
      ),
    ),
  );
}

function preview(
  screen: Extract<Screen, { name: "preview" }>,
  state: PanelState,
  actions: Actions,
): Node {
  const { draft } = screen.generated;
  const broad = draft.matches.some(isBroadPattern);
  return h(
    "div",
    { class: "card", "data-testid": "preview" },
    h("h2", {}, draft.name),
    h("p", {}, draft.description),
    h("p", { class: "muted" }, "Previewing on this tab only. Runs on:"),
    h("ul", {}, ...draft.matches.map((pattern) => h("li", {}, h("code", {}, pattern)))),
    broad &&
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
    state.keepError && h("div", { class: "notice error", role: "alert" }, state.keepError),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { class: "primary", disabled: screen.keeping, onclick: actions.keep },
        screen.keeping ? "Keeping…" : "Keep",
      ),
      h("button", { disabled: screen.keeping, onclick: actions.discard }, "Discard"),
      h(
        "button",
        { class: "link", "aria-expanded": String(screen.showCode), onclick: actions.toggleCode },
        screen.showCode ? "Hide code" : "View code",
      ),
    ),
    screen.showCode && codeView(draft.css, draft.js),
  );
}

function codeView(css: string | undefined, js: string | undefined): Node {
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

export function renderScreen(state: PanelState, actions: Actions): Node {
  const screen = state.screen;
  switch (screen.name) {
    case "compose":
      return compose(state, actions);
    case "picking":
      return busy("Click an element on the page. Press Esc to cancel.", actions.cancelPick);
    case "generating":
      return busy("Writing your mod…", actions.cancelGenerate);
    case "preview":
      return preview(screen, state, actions);
    case "saved":
      return h(
        "div",
        { class: "stack" },
        h("div", { class: "notice ok", role: "status" }, `Saved “${screen.modName}”.`),
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
