import { newModState } from "@/lib/mods/state";
import { exportBundle, parseImport } from "@/lib/mods/transfer";
import type { RpcHandlers } from "@/lib/rpc/server";
import { getLibrary, updateLibrary } from "@/lib/storage";

export const exportMods: RpcHandlers["exportMods"] = async ({ ids }) => {
  const { mods } = await getLibrary();
  const selected = Object.values(mods).filter((mod) => !ids || ids.includes(mod.id));
  if (selected.length === 0) return { ok: false, error: "There are no mods to export yet." };
  const now = new Date().toISOString();
  const name = selected.length === 1 ? (selected[0]?.name ?? "mod") : "mods";
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mods";
  return {
    ok: true,
    value: { fileName: `claymod-${slug}.json`, json: exportBundle(selected, now) },
  };
};

/**
 * Imports validated mods as new copies (fresh ids, so nothing is overwritten). Imported JS stays
 * off until the user has viewed the code and enabled it.
 */
export const importMods: RpcHandlers["importMods"] = async ({ text }) => {
  const parsed = parseImport(text);
  if (parsed.mods.length === 0)
    return { ok: false, error: parsed.errors.join(" ") || "No mods found." };
  const imported = await updateLibrary((library) =>
    parsed.mods.map((mod) => {
      const id = crypto.randomUUID();
      library.mods[id] = { ...mod, id };
      library.state[id] = newModState(false);
      return mod.name;
    }),
  );
  return { ok: true, value: { imported, errors: parsed.errors } };
};
