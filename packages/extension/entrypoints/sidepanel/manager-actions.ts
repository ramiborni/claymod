import { originsForMatches } from "@/lib/origins";
import type { RpcResult } from "@/lib/rpc/protocol";
import type { PanelContext } from "./context";
import type { ManagerActions } from "./manager-view";
import type { ManagerUi } from "./state";

function download(fileName: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function managerActions(
  ctx: PanelContext,
  startRepair: (modId: string, modName: string) => void,
): ManagerActions {
  // Created once: a re-render must never replace the input while the file picker is open.
  const fileInput = Object.assign(document.createElement("input"), {
    type: "file",
    accept: "application/json,.json",
    hidden: true,
  });
  fileInput.dataset.testid = "import-file";
  document.body.append(fileInput);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) importFile(file);
  });
  const setUi = (patch: Partial<ManagerUi>) =>
    ctx.update({ manager: { ...ctx.get().manager, ...patch } });
  const notice = (kind: "ok" | "error", text: string) => setUi({ notice: { kind, text } });

  /** Runs a change, shows its error if any, then reloads the list. */
  async function run(call: Promise<RpcResult<unknown>>, patch: Partial<ManagerUi> = {}) {
    const result = await call;
    setUi({ ...patch, notice: result.ok ? null : { kind: "error", text: result.error } });
    await ctx.refreshMods();
  }

  return {
    setFilter: (filter) => setUi({ filter }),
    setSitePaused: (host, paused) => void run(ctx.rpc.call("setSitePaused", { host, paused })),
    setEnabled: (id, enabled) => void run(ctx.rpc.call("setEnabled", { id, enabled })),
    toggleCode: (id) => {
      const expanded = new Set(ctx.get().manager.expanded);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      setUi({ expanded });
    },
    approveJs: (id) => void run(ctx.rpc.call("approveJs", { id })),
    startRename: (id) => setUi({ renaming: id }),
    rename: (id, name) => void run(ctx.rpc.call("rename", { id, name }), { renaming: null }),
    undo: (id) => void run(ctx.rpc.call("undo", { id })),
    askDelete: (id) => setUi({ confirmDelete: id }),
    remove: (id) => void run(ctx.rpc.call("deleteMod", { id }), { confirmDelete: null }),
    repair: (mod) => startRepair(mod.id, mod.name),
    allowAccess: (mod) => {
      // Called straight from the click so Chrome accepts the permission request.
      void browser.permissions
        .request({ origins: originsForMatches(mod.matches) })
        .then(() => ctx.refreshMods());
    },
    exportMods: (ids) =>
      void ctx.rpc.call("exportMods", { ids }).then((result) => {
        if (!result.ok) return notice("error", result.error);
        download(result.value.fileName, result.value.json);
        notice("ok", `Exported to ${result.value.fileName}.`);
      }),
    openImport: () => fileInput.click(),
  };

  function importFile(file: File) {
    void file.text().then(async (text) => {
      const result = await ctx.rpc.call("importMods", { text });
      if (!result.ok) return notice("error", result.error);
      const { imported, errors } = result.value;
      const skipped = errors.length ? ` Skipped ${errors.length}: ${errors.join("; ")}` : "";
      notice(
        "ok",
        `Imported ${imported.length} mod${imported.length === 1 ? "" : "s"}. Review any JavaScript before enabling it.${skipped}`,
      );
      setUi({ filter: "all" });
      await ctx.refreshMods();
    });
  }
}
