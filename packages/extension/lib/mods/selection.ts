import { type Mod, matchesAny } from "@claymod/core/mod";
import type { Library } from "../storage";

export const hostOf = (url: string): string | undefined => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? hostname : undefined;
  } catch {
    return undefined;
  }
};

/** Mods that should be active on this URL right now. */
export function modsForUrl(library: Library, url: string): Mod[] {
  const host = hostOf(url);
  if (!host || library.pausedSites.includes(host)) return [];
  return Object.values(library.mods).filter(
    (mod) => library.state[mod.id]?.enabled && matchesAny(mod.matches, url),
  );
}

/** `https://example.com/feed*` → `https://example.com/*`. */
export function sitePattern(pattern: string): string {
  if (pattern === "<all_urls>") return pattern;
  const separator = pattern.indexOf("://");
  const rest = pattern.slice(separator + 3);
  return `${pattern.slice(0, separator)}://${rest.slice(0, rest.indexOf("/"))}/*`;
}

/**
 * Match patterns for the CSS/checks content script: the whole site of every enabled mod, not
 * just the mod's paths. Single-page apps change paths without a page load, so the script must
 * already be on the page to apply a mod when the app navigates into its path.
 */
export function contentScriptMatches(library: Library): string[] {
  const enabled = Object.values(library.mods).filter((mod) => library.state[mod.id]?.enabled);
  return [...new Set(enabled.flatMap((mod) => mod.matches.map(sitePattern)))].sort();
}

export const userScriptId = (modId: string) => `mod-${modId}`;

export interface UserScriptRegistration {
  id: string;
  matches: string[];
  excludeMatches: string[];
  js: Array<{ code: string }>;
  runAt: Mod["runAt"];
  world: "USER_SCRIPT";
}

/**
 * One user script per enabled mod with reviewed JS. Paused sites are excluded so the kill
 * switch stops JS too.
 */
export function userScriptRegistrations(library: Library): UserScriptRegistration[] {
  const excludeMatches = library.pausedSites.flatMap((host) => [`*://${host}/*`]);
  return Object.values(library.mods)
    .filter(
      (mod) =>
        mod.js?.trim() && library.state[mod.id]?.enabled && library.state[mod.id]?.jsApproved,
    )
    .map((mod) => ({
      id: userScriptId(mod.id),
      matches: mod.matches,
      excludeMatches,
      js: [{ code: mod.js ?? "" }],
      runAt: mod.runAt,
      world: "USER_SCRIPT" as const,
    }));
}
