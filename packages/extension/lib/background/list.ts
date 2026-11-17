import { type Mod, matchesAny } from "@claymod/core/mod";
import { hostOf } from "@/lib/mods/selection";
import type { ModState } from "@/lib/mods/state";
import { originsForMatches } from "@/lib/origins";
import type { ModSummary, RpcHandlers } from "@/lib/rpc/server";
import { getLibrary } from "@/lib/storage";
import { userScriptsAvailable, userScriptsHelp } from "@/lib/user-scripts";
import { syncRegistrations } from "./sync";

async function tabUrl(tabId: number | undefined): Promise<string | undefined> {
  if (tabId === undefined) return undefined;
  // url is only visible where Claymod has access (activeTab or a kept mod's site).
  return (await browser.tabs.get(tabId).catch(() => undefined))?.url;
}

async function summarize(mod: Mod, state: ModState, url: string | undefined): Promise<ModSummary> {
  return {
    id: mod.id,
    name: mod.name,
    description: mod.description,
    matches: mod.matches,
    css: mod.css,
    js: mod.js,
    version: mod.version,
    canUndo: mod.history.length > 0,
    enabled: state.enabled,
    jsApproved: state.jsApproved,
    health: state.health,
    lastFailed: state.checkRuns.at(-1)?.failedSelectors ?? [],
    recentChecks: state.checkRuns.slice(-10).map((run) => run.failedSelectors.length === 0),
    appliesHere: url ? matchesAny(mod.matches, url) : false,
    hasAccess: await browser.permissions.contains({ origins: originsForMatches(mod.matches) }),
  };
}

export const listMods: RpcHandlers["listMods"] = async ({ tabId }) => {
  // The user may have just turned user scripts on; registering is a no-op when nothing changed.
  void syncRegistrations();
  const [library, url] = await Promise.all([getLibrary(), tabUrl(tabId)]);
  const host = url ? hostOf(url) : undefined;
  const mods = await Promise.all(
    Object.values(library.mods)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((mod) =>
        summarize(
          mod,
          library.state[mod.id] ?? {
            enabled: false,
            jsApproved: false,
            checkRuns: [],
            health: "healthy",
          },
          url,
        ),
      ),
  );
  return {
    ok: true,
    value: {
      mods,
      site: host ? { host, paused: library.pausedSites.includes(host) } : null,
      userScripts: { available: userScriptsAvailable(), help: userScriptsHelp(browser.runtime.id) },
    },
  };
};
