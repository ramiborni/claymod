export type Env = Record<string, string | undefined>;

const TRACING = /^(LANGSMITH_|LANGCHAIN_)/;

/**
 * LangChain sends traces to LangSmith when these are set. Claymod has no telemetry, so a user's
 * shell settings must not turn tracing on for anything the bridge starts.
 */
export function clearTracingEnv(env: Env): string[] {
  const removed = Object.keys(env).filter((key) => TRACING.test(key));
  for (const key of removed) delete env[key];
  return removed;
}

/** Enough for a CLI to run (paths, locale, temp dirs, proxies, certificates), nothing personal. */
const ALLOWED = new Set([
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "https_proxy",
  "http_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);

/**
 * API-key mode: a minimal environment with an empty HOME, so the CLI can't find the user's
 * saved sign-in or settings. CLI mode passes the environment through (minus tracing), because
 * the user's own setup is what authenticates the CLI.
 */
export function agentEnv(options: {
  base: Env;
  auth: "cli" | "api-key";
  homeDir: string;
  path: string;
  extra: Record<string, string>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.base)) {
    if (value === undefined || TRACING.test(key)) continue;
    if (options.auth === "cli" || ALLOWED.has(key)) env[key] = value;
  }
  if (options.auth === "api-key") {
    env.HOME = options.homeDir;
    env.USERPROFILE = options.homeDir;
    env.XDG_CONFIG_HOME = `${options.homeDir}/.config`;
  }
  env[pathKey(options.base)] = options.path;
  return { ...env, ...options.extra };
}

/** Windows spells it "Path"; keep whatever spelling the environment uses. */
export function pathKey(env: Env): string {
  return Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
}
