import type { ModSummary } from "@/lib/rpc/protocol";
import { h } from "@/lib/ui/dom";
import type { ManagerActions } from "./manager-view";
import { codeView } from "./result-view";
import type { ManagerUi } from "./state";

export const enabledSwitch = (mod: ModSummary, actions: ManagerActions) =>
  h(
    "label",
    { class: "switch" },
    h("span", { class: "visually-hidden" }, "Enabled"),
    h("input", {
      type: "checkbox",
      checked: mod.enabled,
      onchange: (e: Event) => actions.setEnabled(mod.id, (e.target as HTMLInputElement).checked),
    }),
  );

function renameForm(mod: ModSummary, actions: ManagerActions): Node {
  const input = h("input", { value: mod.name, "aria-label": "New name", maxlength: "80" });
  const submit = (event: Event) => {
    event.preventDefault();
    actions.rename(mod.id, input.value);
  };
  return h(
    "form",
    { class: "row", onsubmit: submit },
    input,
    h("button", { class: "sm primary", type: "submit" }, "Save"),
    h(
      "button",
      { class: "sm", type: "button", onclick: () => actions.startRename(null) },
      "Cancel",
    ),
  );
}

/** Everything about one mod, opened from its name: what it does, its code and its actions. */
export function modDetails(mod: ModSummary, ui: ManagerUi, actions: ManagerActions): Node {
  const codeOpen = ui.expanded.has(mod.id);
  const deleting = ui.confirmDelete === mod.id;
  const broken = mod.health === "needs-repair";
  const link = (label: string, onclick: () => void, extra = "") =>
    h("button", { class: `link ${extra}`.trim(), onclick }, label);
  return h(
    "div",
    { class: "mod-detail" },
    ui.renaming === mod.id && renameForm(mod, actions),
    mod.description && h("p", { class: "small" }, mod.description),
    h(
      "p",
      { class: "muted small" },
      `v${mod.version} · runs on `,
      h("span", { class: "mono" }, mod.matches.join(", ")),
    ),
    broken &&
      h(
        "div",
        { class: "notice error" },
        `This mod's checks failed on the last visits${mod.lastFailed.length ? ` (${mod.lastFailed.join(", ")} not found)` : ""}. The site probably changed. `,
        mod.appliesHere
          ? h("button", { class: "link", onclick: () => actions.repair(mod) }, "Repair")
          : "Open a page where it runs to repair it.",
      ),
    broken &&
      h(
        "div",
        { class: "row" },
        enabledSwitch(mod, actions),
        h("span", { class: "small muted" }, mod.enabled ? "On" : "Off"),
      ),
    !mod.hasAccess &&
      h(
        "div",
        { class: "notice warn" },
        "Claymod can't run this mod until you allow it on its sites. ",
        h("button", { class: "link", onclick: () => actions.allowAccess(mod) }, "Allow"),
      ),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        {
          class: "link",
          "aria-expanded": String(codeOpen),
          onclick: () => actions.toggleCode(mod.id),
        },
        codeOpen ? "Hide code" : "View code",
      ),
      link("Rename", () => actions.startRename(mod.id)),
      mod.canUndo && link("Undo", () => actions.undo(mod.id)),
      link("Export", () => actions.exportMods([mod.id])),
      deleting
        ? link("Delete for good?", () => actions.remove(mod.id), "danger")
        : link("Delete", () => actions.askDelete(mod.id), "danger"),
    ),
    codeOpen && codeView(mod.css, mod.js),
    codeOpen &&
      mod.js &&
      !mod.jsApproved &&
      h(
        "div",
        { class: "notice warn" },
        h("p", {}, "Read the JavaScript above. Enable it only if you trust it."),
        h(
          "button",
          { class: "sm primary", onclick: () => actions.approveJs(mod.id) },
          "Enable JavaScript",
        ),
      ),
  );
}
