import { existsSync, readFileSync } from "node:fs";
import { AGENT_LABELS } from "@claymod/core/bridge-protocol";
import { readConfig } from "../config";
import type { Command, CommandContext } from "../context";
import { agentEnv } from "../env";
import { BROWSER_LABELS, browsersFor, configDir, manifestPath } from "../paths";
import { RUNNERS } from "../runners";
import { agentSearchPath } from "../runners/run-agent";
import type { AgentRunner } from "../runners/types";

export const DOCTOR_HELP = `Usage: claymod-bridge doctor

Checks the browser registration, the system keychain, and which agent CLIs the bridge can run.
Never prints API keys.`;

const FIX_INSTALL =
  "Fix: claymod-bridge install --extension-id <id> (Claymod settings > Local agent shows it)";

function registration(context: CommandContext): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = false;
  for (const browser of browsersFor(context.platform)) {
    const path = manifestPath(browser, context);
    if (!existsSync(path)) {
      lines.push(`– ${BROWSER_LABELS[browser]}: not registered`);
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        path?: string;
        allowed_origins?: string[];
      };
      if (!manifest.path || !existsSync(manifest.path)) {
        lines.push(
          `✗ ${BROWSER_LABELS[browser]}: the registered program is missing (${manifest.path}). ${FIX_INSTALL}`,
        );
        continue;
      }
      ok = true;
      lines.push(`✓ ${BROWSER_LABELS[browser]}: registered (${path})`);
      lines.push(`    allowed: ${(manifest.allowed_origins ?? []).join(", ") || "none"}`);
    } catch {
      lines.push(`✗ ${BROWSER_LABELS[browser]}: ${path} isn't valid JSON. ${FIX_INSTALL}`);
    }
  }
  if (!ok) lines.push(`✗ Not registered with any browser. ${FIX_INSTALL}`);
  return { lines, ok };
}

async function signedIn(
  runner: AgentRunner,
  executable: string,
  path: string,
  context: CommandContext,
) {
  if (!runner.signInCheck) return "sign-in: run it once to check";
  const result = await context
    .spawn({
      command: [executable, ...runner.signInCheck],
      cwd: context.tmpRoot,
      env: agentEnv({ base: context.env, auth: "cli", homeDir: context.home, path, extra: {} }),
      stdin: "",
      signal: AbortSignal.timeout(15_000),
    })
    .catch(() => ({ exitCode: -1 }));
  return result.exitCode === 0 ? "signed in" : `not signed in (${runner.signInHint})`;
}

async function agents(
  context: CommandContext,
  savedPath: string | undefined,
): Promise<{ lines: string[]; found: number }> {
  const path = agentSearchPath({ ...context, savedPath });
  const keychain = await context.keys.available();
  const lines = [
    keychain
      ? "✓ System keychain available"
      : "✗ System keychain unavailable: API keys can only come from environment variables.",
  ];
  let found = 0;
  for (const runner of Object.values(RUNNERS)) {
    const label = AGENT_LABELS[runner.id];
    const executable = context.which(runner.command, path);
    if (!executable) {
      lines.push(`– ${label}: '${runner.command}' not found`);
      continue;
    }
    found++;
    const key = keychain ? await context.keys.get(runner.id).catch(() => undefined) : undefined;
    const keyNote = key
      ? "API key saved"
      : context.env[runner.keyEnv]
        ? `${runner.keyEnv} set`
        : "no API key";
    lines.push(
      `✓ ${label}: ${executable} · ${await signedIn(runner, executable, path, context)} · ${keyNote}`,
    );
  }
  if (found === 0)
    lines.push(
      "✗ No agent CLI found. Install one, then run 'claymod-bridge install' again from that terminal.",
    );
  return { lines, found };
}

export const doctor: Command = async (args, context) => {
  if (args.includes("--help") || args.includes("-h")) {
    context.out(DOCTOR_HELP);
    return 0;
  }
  const config = await readConfig(configDir(context));
  context.out(`claymod-bridge ${context.version}`);
  const registered = registration(context);
  const agentReport = await agents(context, config?.path);
  for (const line of [...registered.lines, "", ...agentReport.lines]) context.out(line);
  if (!config?.path)
    context.out(
      "! No saved PATH: run 'claymod-bridge install' from a terminal where your agents work.",
    );
  if (context.clearedTracing.length > 0) {
    context.out(`! Cleared ${context.clearedTracing.join(", ")}: the bridge never sends traces.`);
  }
  return registered.ok && agentReport.found > 0 ? 0 : 1;
};
