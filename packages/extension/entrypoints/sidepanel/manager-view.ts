import type { ManagerView, ModSummary } from "@/lib/rpc/protocol";
import { h } from "@/lib/ui/dom";
import type { ManagerUi } from "./state";
import { codeView } from "./views";

export interface ManagerActions {
  setFilter(filter: ManagerUi["filter"]): void;
  setSitePaused(host: string, paused: boolean): void;
  setEnabled(id: string, enabled: boolean): void;
  toggleCode(id: string): void;
  approveJs(id: string): void;
  startRename(id: string | null): void;
  rename(id: string, name: string): void;
  undo(id: string): void;
  askDelete(id: string | null): void;
  remove(id: string): void;
  repair(mod: ModSummary): void;
  allowAccess(mod: ModSummary): void;
  exportMods(ids?: string[]): void;
  /** Opens the file picker; the input lives outside the re-rendered list. */
  openImport(): void;
}

function pills(mod: ModSummary): Node[] {
  const pill = (kind: string, text: string) => h("span", { class: `pill ${kind}` }, text);
  return [
    !mod.enabled && pill("", "Off"),
    mod.health === "needs-repair" && pill("error", "Needs repair"),
    mod.js && !mod.jsApproved && pill("warn", "JavaScript needs review"),
    !mod.hasAccess && pill("warn", "Needs site access"),
    pill("", `v${mod.version}`),
  ].filter((node): node is HTMLElement => Boolean(node));
}

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
    h("button", { class: "primary", type: "submit" }, "Save"),
    h("button", { type: "button", onclick: () => actions.startRename(null) }, "Cancel"),
  );
}

function modCard(mod: ModSummary, ui: ManagerUi, actions: ManagerActions): Node {
  const expanded = ui.expanded.has(mod.id);
  const deleting = ui.confirmDelete === mod.id;
  return h(
    "article",
    { class: "card", "data-testid": "mod", "data-mod-id": mod.id },
    ui.renaming === mod.id ? renameForm(mod, actions) : h("h3", {}, mod.name),
    h("div", { class: "row" }, ...pills(mod)),
    h("p", { class: "muted" }, mod.description),
    h("p", { class: "muted small" }, mod.matches.join(", ")),
    mod.health === "needs-repair" &&
      h(
        "div",
        { class: "notice error" },
        `This mod's checks failed on the last visits${mod.lastFailed.length ? ` (${mod.lastFailed.join(", ")} not found)` : ""}. The site probably changed. `,
        mod.appliesHere
          ? h("button", { class: "link", onclick: () => actions.repair(mod) }, "Repair")
          : "Open a page where it runs to repair it.",
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
        "label",
        { class: "switch" },
        h("input", {
          type: "checkbox",
          checked: mod.enabled,
          onchange: (e: Event) =>
            actions.setEnabled(mod.id, (e.target as HTMLInputElement).checked),
        }),
        "Enabled",
      ),
      h(
        "button",
        {
          class: "link",
          "aria-expanded": String(expanded),
          onclick: () => actions.toggleCode(mod.id),
        },
        expanded ? "Hide code" : "View code",
      ),
      h("button", { class: "link", onclick: () => actions.startRename(mod.id) }, "Rename"),
      mod.canUndo && h("button", { class: "link", onclick: () => actions.undo(mod.id) }, "Undo"),
      h("button", { class: "link", onclick: () => actions.exportMods([mod.id]) }, "Export"),
      deleting
        ? h(
            "button",
            { class: "link danger", onclick: () => actions.remove(mod.id) },
            "Delete for good?",
          )
        : h("button", { class: "link", onclick: () => actions.askDelete(mod.id) }, "Delete"),
    ),
    expanded && codeView(mod.css, mod.js),
    expanded &&
      mod.js &&
      !mod.jsApproved &&
      h(
        "div",
        { class: "notice warn" },
        "Read the JavaScript above. Enable it only if you trust it. ",
        h(
          "button",
          { class: "primary", onclick: () => actions.approveJs(mod.id) },
          "Enable JavaScript",
        ),
      ),
  );
}

function siteBar(view: ManagerView, actions: ManagerActions): Node | false {
  const site = view.site;
  if (!site) return false;
  return h(
    "div",
    { class: "row between" },
    h("span", {}, h("strong", {}, site.host), site.paused ? " · all mods paused" : ""),
    h(
      "button",
      { onclick: () => actions.setSitePaused(site.host, !site.paused) },
      site.paused ? "Resume mods on this site" : "Pause mods on this site",
    ),
  );
}

export function renderManager(ui: ManagerUi, actions: ManagerActions): Node {
  const view = ui.view;
  if (!view) return h("p", { class: "muted" }, "Loading…");
  const shown = view.mods.filter((mod) => ui.filter === "all" || mod.appliesHere);
  const jsBlocked =
    view.mods.some((mod) => mod.enabled && mod.js && mod.jsApproved) && !view.userScripts.available;
  const segment = (filter: ManagerUi["filter"], label: string) =>
    h(
      "button",
      {
        class: ui.filter === filter ? "segment active" : "segment",
        "aria-pressed": String(ui.filter === filter),
        onclick: () => actions.setFilter(filter),
      },
      label,
    );
  return h(
    "div",
    { class: "stack" },
    siteBar(view, actions),
    view.site?.paused &&
      h(
        "div",
        { class: "notice warn" },
        "Mods are paused on this site. Nothing from Claymod runs here until you resume.",
      ),
    jsBlocked &&
      h(
        "div",
        { class: "notice warn", "data-testid": "user-scripts-off" },
        `Some mods include JavaScript that isn't running. ${view.userScripts.help}`,
      ),
    ui.notice &&
      h(
        "div",
        {
          class: `notice ${ui.notice.kind}`,
          role: ui.notice.kind === "error" ? "alert" : "status",
        },
        ui.notice.text,
      ),
    h("div", { class: "row" }, segment("site", "This site"), segment("all", "All sites")),
    shown.length === 0 &&
      h(
        "p",
        { class: "muted" },
        ui.filter === "site"
          ? "No mods for this site yet. Describe a change in Create."
          : "No mods yet.",
      ),
    ...shown.map((mod) => modCard(mod, ui, actions)),
    h(
      "div",
      { class: "row" },
      h(
        "button",
        { onclick: () => actions.exportMods(), disabled: view.mods.length === 0 },
        "Export all",
      ),
      h("button", { onclick: actions.openImport }, "Import…"),
    ),
  );
}
