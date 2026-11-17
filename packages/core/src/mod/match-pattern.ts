/**
 * Validates Chrome match patterns:
 * https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
 *
 * Only web schemes are accepted: mods never run on file://, ftp:// or extension pages.
 */
const SCHEMES = new Set(["*", "http", "https"]);
const HOST = /^(\*|(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*)(:(\*|\d{1,5}))?$/i;

export function isValidMatchPattern(pattern: string): boolean {
  if (pattern === "<all_urls>") return true;
  const separator = pattern.indexOf("://");
  if (separator === -1) return false;
  const scheme = pattern.slice(0, separator);
  const rest = pattern.slice(separator + 3);
  const slash = rest.indexOf("/");
  if (!SCHEMES.has(scheme) || slash === -1) return false;
  return HOST.test(rest.slice(0, slash));
}

/** The host part of a pattern, used to request per-site permissions. */
export function hostOfMatchPattern(pattern: string): string | undefined {
  if (!isValidMatchPattern(pattern) || pattern === "<all_urls>") return undefined;
  const rest = pattern.slice(pattern.indexOf("://") + 3);
  return rest.slice(0, rest.indexOf("/"));
}
