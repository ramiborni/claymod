import type { ManagerView, ModSummary } from "@/lib/rpc/protocol";
import { h } from "@/lib/ui/dom";
import { enabledSwitch, modDetails } from "./mod-details";
import type { ManagerUi } from "./state";

export interface ManagerActions {
  setFilter(filter: ManagerUi["filter"]): void;
  setSitePaused(host: string, paused: boolean): void;
  setEnabled(id: string, enabled: boolean): void;
  toggleDetails(id: string): void;
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

const VISITS = 10;

/** The last visits as a strip: one cell per visit, failed in red, not visited yet empty. */
function strip(mod: ModSummary): Node {
  const runs = mod.recentChecks.slice(-VISITS);
  const failed = runs.filter((passed) => !passed).length;
  const label = runs.length
    ? `Last ${runs.length} visit${runs.length === 1 ? "" : "s"}: ${runs.length - failed} passed${failed ? `, ${failed} failed` : ""}`
    : "Not checked on a visit yet";
  const cells = [
    ...runs.map((passed) => (passed ? "" : "x")),
    ...Array(VISITS - runs.length).fill("e"),
  ];
  return h(
    "span",
    { class: "strip", role: "img", "aria-label": label },
    ...cells.map((kind) => h("i", kind ? { class: kind } : {})),
  );
}

function status(mod: ModSummary, ui: ManagerUi): Node {
  if (mod.health === "needs-repair") {
    return h("span", { class: "mod-status bad" }, "Stopped matching the page on the last visits");
  }
  const extras = [
    !mod.enabled && "Off",
    mod.js && !mod.jsApproved && "JavaScript needs review",
    !mod.hasAccess && "Needs site access",
    mod.recentChecks.length === 0 && "Not checked on a visit yet",
    ui.filter === "all" && mod.matches[0],
  ].filter(Boolean);
  return h(
    "span",
    { class: "row", style: "gap:8px" },
    mod.recentChecks.length > 0 && strip(mod),
    extras.length > 0 && h("span", { class: "mod-status" }, extras.join(" · ")),
  );
}

function modItem(mod: ModSummary, ui: ManagerUi, actions: ManagerActions): Node {
  const open = ui.details.has(mod.id);
  const broken = mod.health === "needs-repair";
  return h(
    "article",
    { class: "mod", "data-testid": "mod", "data-mod-id": mod.id },
    h(
      "div",
      { class: "mod-row" },
      h(
        "div",
        { class: "mod-main" },
        h(
          "button",
          {
            class: "mod-name",
            "aria-expanded": String(open),
            onclick: () => actions.toggleDetails(mod.id),
          },
          mod.name,
        ),
        status(mod, ui),
      ),
      broken && mod.appliesHere
        ? h("button", { class: "sm primary", onclick: () => actions.repair(mod) }, "Repair")
        : enabledSwitch(mod, actions),
    ),
    open && modDetails(mod, ui, actions),
  );
}

function head(
  view: ManagerView,
  ui: ManagerUi,
  shown: ModSummary[],
  actions: ManagerActions,
): Node {
  const site = ui.filter === "site" ? view.site : null;
  const running = shown.filter((m) => m.enabled && m.health === "healthy").length;
  const broken = shown.filter((m) => m.health === "needs-repair").length;
  const off = shown.filter((m) => !m.enabled).length;
  return h(
    "div",
    { class: "site-head" },
    h(
      "div",
      { class: "stack", style: "gap:4px;min-width:0" },
      h(
        "h2",
        { class: "site-name" },
        site ? site.host : ui.filter === "all" ? "All sites" : "This tab",
      ),
      h(
        "span",
        { class: "counts" },
        h("span", {}, h("b", {}, String(running)), " running"),
        broken > 0 && h("span", { class: "bad" }, h("b", {}, String(broken)), " needs repair"),
        off > 0 && h("span", {}, h("b", {}, String(off)), " off"),
      ),
    ),
    site &&
      h(
        "button",
        {
          class: "sm",
          "aria-label": site.paused ? "Resume mods on this site" : "Pause mods on this site",
          onclick: () => actions.setSitePaused(site.host, !site.paused),
        },
        site.paused ? "Resume site" : "Pause site",
      ),
  );
}

/** The site you're on (or every site) and its mods, under the command. */
export function renderSite(ui: ManagerUi, actions: ManagerActions, dim: boolean): Node {
  const view = ui.view;
  const cls = dim ? "site dim" : "site";
  if (!view)
    return h(
      "section",
      { class: cls },
      h("p", { class: "empty", style: "padding-top:14px" }, "Loading…"),
    );
  const shown = view.mods.filter((mod) => ui.filter === "all" || mod.appliesHere);
  const jsBlocked =
    view.mods.some((m) => m.enabled && m.js && m.jsApproved) && !view.userScripts.available;
  return h(
    "section",
    { class: cls, "aria-label": "Mods" },
    head(view, ui, shown, actions),
    ui.filter === "site" &&
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
    shown.length === 0 &&
      h(
        "p",
        { class: "empty" },
        ui.filter === "site"
          ? "No mods for this site yet. Describe a change above."
          : "No mods yet.",
      ),
    ...shown.map((mod) => modItem(mod, ui, actions)),
  );
}
