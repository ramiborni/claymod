import { type Mod, nextModVersion, previousModVersion } from "@claymod/core/mod";
import type { RpcHandlers } from "@/lib/rpc/server";
import { type Library, updateLibrary } from "@/lib/storage";

const MISSING = "This mod no longer exists. Close and reopen the mod list.";

export const draftOf = (mod: Mod) => ({
  name: mod.name,
  description: mod.description,
  matches: mod.matches,
  css: mod.css,
  js: mod.js,
  runAt: mod.runAt,
  checks: mod.checks,
});

/** Runs a change on one mod; answers with a user-facing error if it was deleted meanwhile. */
async function withMod(id: string, change: (library: Library, mod: Mod) => void) {
  const found = await updateLibrary((library) => {
    const mod = library.mods[id];
    if (!mod) return false;
    change(library, mod);
    return true;
  });
  return found ? { ok: true as const, value: null } : { ok: false as const, error: MISSING };
}

const resetHealth = (library: Library, id: string) => {
  const state = library.state[id];
  if (state) Object.assign(state, { checkRuns: [], health: "healthy" });
};

export const setEnabled: RpcHandlers["setEnabled"] = ({ id, enabled }) =>
  withMod(id, (library) => {
    const state = library.state[id];
    if (state) state.enabled = enabled;
  });

export const rename: RpcHandlers["rename"] = async ({ id, name }) => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80)
    return { ok: false, error: "Use a name between 1 and 80 characters." };
  return withMod(id, (library, mod) => {
    const createdBy = { provider: "user", model: "manual edit" };
    library.mods[id] = nextModVersion(
      mod,
      { ...draftOf(mod), name: trimmed },
      { now: new Date().toISOString(), createdBy },
    );
  });
};

export const deleteMod: RpcHandlers["deleteMod"] = ({ id }) =>
  withMod(id, (library) => {
    delete library.mods[id];
    delete library.state[id];
  });

export const undo: RpcHandlers["undo"] = ({ id }) =>
  withMod(id, (library, mod) => {
    const previous = previousModVersion(mod, new Date().toISOString());
    if (!previous) return;
    library.mods[id] = previous;
    resetHealth(library, id);
  });

/** The side panel only offers this after the user opened the code. */
export const approveJs: RpcHandlers["approveJs"] = ({ id }) =>
  withMod(id, (library) => {
    const state = library.state[id];
    if (state) state.jsApproved = true;
  });

export const setSitePaused: RpcHandlers["setSitePaused"] = async ({ host, paused }) => {
  await updateLibrary((library) => {
    const others = library.pausedSites.filter((site) => site !== host);
    library.pausedSites = paused ? [...others, host] : others;
  });
  return { ok: true, value: null };
};

export { resetHealth };
