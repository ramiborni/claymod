import { AGENT_LABELS, type AgentId, type BridgeError } from "@claymod/core/bridge-protocol";
import type { AgentAuth } from "./types";

const AUTH_PATTERN =
  /not (?:logged|signed) in|log ?in|sign ?in|authenticat|unauthori[sz]ed|\b401\b|invalid api key|api key (?:is )?(?:missing|invalid|not)|credential/i;

export const looksLikeAuthError = (text: string) => AUTH_PATTERN.test(text);

/** Last few non-empty lines: CLIs put the reason for a failure at the end. */
export function tail(text: string, lines = 4, maxChars = 600): string {
  const kept = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-lines)
    .join(" · ");
  return kept.length > maxChars ? `…${kept.slice(-maxChars)}` : kept;
}

export function authError(
  agent: AgentId,
  auth: AgentAuth,
  signInHint: string,
  detail: string,
): BridgeError {
  const label = AGENT_LABELS[agent];
  const said = detail ? ` (${label} said: ${tail(detail, 2, 300)})` : "";
  const message =
    auth === "cli"
      ? `${label} isn't signed in. ${signInHint}${said}`
      : `${label} rejected the API key. Save a new key in Claymod settings (Local agent) or run 'claymod-bridge keys set ${agent}'.${said}`;
  return { kind: "auth", message };
}

export function failure(agent: AgentId, detail: string, exitCode?: number): BridgeError {
  const label = AGENT_LABELS[agent];
  const code = exitCode === undefined ? "" : ` (exit code ${exitCode})`;
  const said = detail ? `: ${tail(detail)}` : ".";
  return {
    kind: "agent-failed",
    message: `${label} failed${code}${said} Try again, or run 'claymod-bridge doctor' to check the setup.`,
  };
}

/** Maps a failed run to an auth error when the CLI's output says so, else a generic failure. */
export function runFailure(
  agent: AgentId,
  auth: AgentAuth,
  signInHint: string,
  detail: string,
  exitCode?: number,
): BridgeError {
  return looksLikeAuthError(detail)
    ? authError(agent, auth, signInHint, detail)
    : failure(agent, detail, exitCode);
}

export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text.trim());
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** First key of an object such as Claude Code's modelUsage or Gemini CLI's stats.models. */
export function firstKey(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.keys(value)[0];
}
