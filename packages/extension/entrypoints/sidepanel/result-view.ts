import { isBroadPattern } from "@/lib/origins";
import { h } from "@/lib/ui/dom";
import type { PanelState, PreviewScreen, Purpose } from "./state";

export interface ResultActions {
  save(): void;
  discard(): void;
  toggleCode(): void;
  showChange(visible: boolean): void;
}

export function codeView(css: string | undefined, js: string | undefined): Node {
  return h(
    "div",
    { class: "stack", "data-testid": "code" },
    css &&
      h(
        "div",
        { class: "stack", style: "gap:6px" },
        h("p", { class: "muted small" }, "CSS"),
        h("pre", {}, css),
      ),
    js &&
      h(
        "div",
        { class: "stack", style: "gap:6px" },
        h("p", { class: "muted small" }, "JavaScript (runs in an isolated user-script world)"),
        h("pre", {}, js),
      ),
  );
}

interface Rule {
  selector: string;
  effect: string;
}

/** The CSS rules a mod adds, as "selector → first declaration", innermost rules only. */
export function cssRules(css: string | undefined, limit = 5): { rules: Rule[]; more: number } {
  const rules: Rule[] = [];
  const text = (css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of text.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim().replace(/\s+/g, " ");
    const first = (match[2] ?? "")
      .split(";")
      .map((d) => d.trim())
      .find(Boolean);
    if (!selector || !first) continue;
    rules.push({ selector, effect: first.replace(/\s*!important/, "").replace(/\s*:\s*/, ": ") });
  }
  return { rules: rules.slice(0, limit), more: Math.max(0, rules.length - limit) };
}

function purposeLine(purpose: Purpose): string | undefined {
  if (purpose.kind === "repair") return `Repaired version of “${purpose.modName}”`;
  if (purpose.kind !== "agent") return undefined;
  return purpose.replaces
    ? `Proposed by ${purpose.client}: new version of “${purpose.replaces.name}”`
    : `Proposed by ${purpose.client}`;
}

function saveLabel(purpose: Purpose): string {
  if (purpose.kind === "repair") return "Save repair";
  if (purpose.kind === "agent" && purpose.replaces) return "Save new version";
  return "Keep";
}

function beforeAfter(screen: PreviewScreen, actions: ResultActions): Node | false {
  if (!screen.preview.css) return false;
  const jsRan = screen.preview.js === "ran";
  const button = (visible: boolean, label: string) =>
    h(
      "button",
      {
        "aria-pressed": String(screen.showingChange === visible),
        disabled: jsRan && !visible,
        title:
          jsRan && !visible
            ? "JavaScript changes can't be hidden without reloading. Discard undoes them."
            : undefined,
        onclick: () => actions.showChange(visible),
      },
      label,
    );
  return h(
    "div",
    { class: "seg", role: "group", "aria-label": "Show the page" },
    button(false, "Before"),
    button(true, "After"),
  );
}

function changes(screen: PreviewScreen): Node {
  const { draft } = screen.generated;
  const { rules, more } = cssRules(draft.css);
  return h(
    "ul",
    { class: "changes", "aria-label": "What changes" },
    ...rules.map((rule) =>
      h("li", { class: "hit" }, h("span", {}, rule.selector), h("span", {}, rule.effect)),
    ),
    more > 0 &&
      h("li", {}, h("span", {}, `${more} more rule${more === 1 ? "" : "s"}`), h("span", {}, "")),
    draft.js?.trim() &&
      h(
        "li",
        {},
        h("span", {}, "JavaScript"),
        h("span", {}, `runs at ${draft.runAt.replace("document_", "")}`),
      ),
  );
}

/** The mod, right under the words that asked for it. */
export function result(screen: PreviewScreen, state: PanelState, actions: ResultActions): Node {
  const { draft } = screen.generated;
  const line = purposeLine(screen.purpose);
  const kind = draft.js?.trim()
    ? draft.css?.trim()
      ? "CSS and JavaScript"
      : "JavaScript"
    : "CSS only";
  return h(
    "div",
    { class: "work" },
    h(
      "div",
      { class: "result", "data-testid": "preview" },
      h(
        "div",
        { class: "result-head" },
        line && h("p", {}, line),
        h(
          "div",
          { class: "row between", style: "flex-wrap:nowrap;align-items:flex-start" },
          h("h2", {}, draft.name),
          h("span", { class: "pill" }, "Previewing"),
        ),
        h("p", {}, draft.description),
        h("p", {}, `${kind} · runs on `, h("span", { class: "mono" }, draft.matches.join(", "))),
      ),
      beforeAfter(screen, actions),
      changes(screen),
      draft.matches.some(isBroadPattern) &&
        h(
          "div",
          { class: "notice warn" },
          "This mod asks to run on every website. Keep it only if that's what you want.",
        ),
      screen.preview.js === "ran" &&
        h(
          "p",
          { class: "muted small", style: "padding:0 14px 10px" },
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
        { class: "result-actions" },
        h(
          "button",
          { class: "primary", disabled: screen.saving, onclick: actions.save },
          screen.saving ? "Saving…" : saveLabel(screen.purpose),
        ),
        h("button", { disabled: screen.saving, onclick: actions.discard }, "Discard"),
        h(
          "button",
          {
            class: "link",
            "aria-expanded": String(screen.showCode),
            onclick: actions.toggleCode,
            style: "margin-left:4px",
          },
          screen.showCode ? "Hide code" : "View code",
        ),
      ),
      screen.showCode && codeView(draft.css, draft.js),
    ),
    h("p", { class: "muted small" }, "Not quite? Change your words above and press Enter."),
  );
}
