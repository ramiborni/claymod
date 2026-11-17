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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hostMatches(patternHost: string, hostname: string): boolean {
  if (patternHost === "*") return true;
  if (patternHost.startsWith("*.")) {
    const base = patternHost.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  }
  return hostname === patternHost;
}

/**
 * Chrome's match-pattern semantics: `*` scheme means http or https, no port means any port,
 * `*.example.com` includes example.com, and the path is matched together with the query.
 */
export function matchesUrl(pattern: string, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  if (pattern === "<all_urls>") return true;
  if (!isValidMatchPattern(pattern)) return false;
  const scheme = pattern.slice(0, pattern.indexOf("://"));
  if (scheme !== "*" && `${scheme}:` !== parsed.protocol) return false;
  const rest = pattern.slice(pattern.indexOf("://") + 3);
  const hostPart = rest.slice(0, rest.indexOf("/"));
  const path = rest.slice(rest.indexOf("/"));
  const [host = "", port] = hostPart.split(":");
  if (!hostMatches(host.toLowerCase(), parsed.hostname)) return false;
  if (port !== undefined && port !== "*" && port !== parsed.port) return false;
  const pathRegExp = new RegExp(`^${path.split("*").map(escapeRegExp).join(".*")}$`);
  return pathRegExp.test(parsed.pathname + parsed.search);
}

export const matchesAny = (patterns: readonly string[], url: string): boolean =>
  patterns.some((pattern) => matchesUrl(pattern, url));
