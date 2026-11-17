import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { err, type Result } from "@claymod/core";
import { AGENT_LABELS, type BridgeError, type GenerateResult } from "@claymod/core/bridge-protocol";
import { agentEnv, type Env, pathKey } from "../env";
import { KEYCHAIN_HELP, type KeyStore } from "../keys";
import { commandLine } from "./command-line";
import { commonBinDirs, searchPath, type Which } from "./locate";
import type { Spawn } from "./spawn";
import type { AgentRunner, Invocation, RunInput } from "./types";

export interface AgentDeps {
  spawn: Spawn;
  which: Which;
  keys: KeyStore;
  env: Env;
  platform: NodeJS.Platform;
  home: string;
  /** PATH saved by `claymod-bridge install`, searched first. */
  savedPath?: string | undefined;
  tmpRoot: string;
}

export function agentSearchPath(deps: Omit<AgentDeps, "spawn" | "keys" | "tmpRoot" | "which">) {
  return searchPath([
    deps.savedPath,
    deps.env[pathKey(deps.env)],
    ...commonBinDirs(deps.home, deps.platform, deps.env),
  ]);
}

const notFound = (runner: AgentRunner): BridgeError => ({
  kind: "agent-not-found",
  message: `Couldn't find ${AGENT_LABELS[runner.id]} ('${runner.command}'). Install it, then run 'claymod-bridge install' again from a terminal where '${runner.command}' works, so the bridge remembers that PATH.`,
});

async function apiKeyFor(
  runner: AgentRunner,
  deps: AgentDeps,
): Promise<Result<string, BridgeError>> {
  let stored: string | undefined;
  let keychainFailed = false;
  try {
    stored = await deps.keys.get(runner.id);
  } catch {
    keychainFailed = true;
  }
  const key = stored ?? deps.env[runner.keyEnv];
  if (key) return { ok: true, value: key };
  if (keychainFailed) return err({ kind: "keychain", message: KEYCHAIN_HELP });
  return err({
    kind: "auth",
    message: `No API key saved for ${AGENT_LABELS[runner.id]}. Add one in Claymod settings (Local agent), or run 'claymod-bridge keys set ${runner.id}'.`,
  });
}

async function writeFiles(workDir: string, files: Invocation["files"]): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const path = join(workDir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { mode: 0o600 });
  }
}

const tooLong = (runner: AgentRunner, reason: string): BridgeError =>
  reason === "unsafe-for-cmd"
    ? {
        kind: "bad-request",
        message: `${AGENT_LABELS[runner.id]} is installed as a .cmd script, which can't be started safely with this request. Install its native .exe build instead.`,
      }
    : {
        kind: "too-large",
        message: `This page is too large to send to ${AGENT_LABELS[runner.id]}. Pick an element to focus on, or use another agent.`,
      };

/** Runs one agent in a fresh temporary folder, with a timeout, and parses its answer. */
export async function runAgent(
  runner: AgentRunner,
  input: RunInput,
  deps: AgentDeps,
  signal: AbortSignal,
): Promise<Result<GenerateResult, BridgeError>> {
  const path = agentSearchPath(deps);
  const executable = deps.which(runner.command, path);
  if (!executable) return err(notFound(runner));
  const key = input.auth === "api-key" ? await apiKeyFor(runner, deps) : undefined;
  if (key && !key.ok) return key;

  const workDir = await mkdtemp(join(deps.tmpRoot, "claymod-agent-"));
  try {
    const homeDir = join(workDir, "home");
    await mkdir(homeDir, { mode: 0o700 });
    const invocation = runner.invocation(input, { workDir, homeDir, platform: deps.platform });
    await writeFiles(workDir, invocation.files);
    const command = commandLine(executable, invocation.args, deps.platform);
    if (!command.ok) return err(tooLong(runner, command.error));

    const extra = { ...invocation.env, ...(key?.ok ? { [runner.keyEnv]: key.value } : {}) };
    const env = agentEnv({ base: deps.env, auth: input.auth, homeDir, path, extra });
    const timeout = AbortSignal.timeout(input.timeoutMs);
    const output = await deps.spawn({
      command: command.value,
      cwd: workDir,
      env,
      stdin: invocation.stdin,
      signal: AbortSignal.any([signal, timeout]),
    });
    if (signal.aborted) return err({ kind: "cancelled", message: "Cancelled." });
    if (timeout.aborted) {
      return err({
        kind: "timeout",
        message: `${AGENT_LABELS[runner.id]} didn't answer within ${Math.round(input.timeoutMs / 1000)} seconds. Try again, or ask for a smaller change.`,
      });
    }
    const outputFile = invocation.outputFile
      ? await readFile(join(workDir, invocation.outputFile), "utf8").catch(() => undefined)
      : undefined;
    return runner.parse({ ...output, outputFile }, input);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
