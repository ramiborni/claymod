/**
 * Host permission origins for a mod's match patterns. `<all_urls>` becomes the two web
 * schemes we declare as optional; everything else is already a valid origin pattern.
 */
export function originsForMatches(matches: readonly string[]): string[] {
  const origins = matches.flatMap((pattern) =>
    pattern === "<all_urls>" ? ["http://*/*", "https://*/*"] : [pattern],
  );
  return [...new Set(origins)];
}

/** True when a pattern would let the mod run on every site. */
export function isBroadPattern(pattern: string): boolean {
  if (pattern === "<all_urls>") return true;
  const host = pattern.slice(pattern.indexOf("://") + 3).split("/")[0] ?? "";
  return host === "*" || host.startsWith("*:");
}
