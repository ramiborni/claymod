import { existsSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { AGENT_IDS } from "@claymod/core/bridge-protocol";
import { readConfig, writeConfig } from "../config";
import type { Command, CommandContext } from "../context";
import { pathKey } from "../env";
import {
  BROWSER_LABELS,
  type Browser,
  browserDataDir,
  browsersFor,
  configDir,
  manifestPath,
  registryKey,
} from "../paths";
import { EXTENSION_ID, planInstall } from "./install-plan";

export const INSTALL_HELP = `Usage: claymod-bridge install --extension-id <id> [--browser chrome|chromium|chrome-for-testing|all]

Registers claymod-bridge with Chrome so the Claymod extension can run local agents.
  --extension-id  Claymod's extension ID (shown in Claymod settings > Local agent). Repeatable.
  --browser       Which browser to register with. Default: every installed one (or Chrome).

Run it from a terminal where your agent CLIs (claude, codex, gemini, agy) work: the bridge
remembers this terminal's PATH, because Chrome often starts with a shorter one.`;

async function reg(context: CommandContext, args: string[]): Promise<boolean> {
  const result = await context.spawn({
    command: ["reg", ...args],
    cwd: context.tmpRoot,
    env: Object.fromEntries(
      Object.entries(context.env).filter((e): e is [string, string] => e[1] !== undefined),
    ),
    stdin: "",
    signal: AbortSignal.timeout(15_000),
  });
  return result.exitCode === 0;
}

function chooseBrowsers(option: string | undefined, context: CommandContext): Browser[] | string {
  const supported = browsersFor(context.platform);
  if (option === "all") return supported;
  if (option) {
    return (supported as string[]).includes(option)
      ? [option as Browser]
      : `Unknown browser "${option}". Use ${supported.join(", ")} or all.`;
  }
  const installed = supported.filter((b) => existsSync(browserDataDir(b, context)));
  return installed.length > 0 ? installed : ["chrome"];
}

export const install: Command = async (args, context) => {
  const { values } = parseArgs({
    args,
    options: {
      "extension-id": { type: "string", multiple: true },
      browser: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    context.out(INSTALL_HELP);
    return 0;
  }
  const previous = await readConfig(configDir(context));
  const extensionIds: string[] = values["extension-id"] ?? previous?.extensionIds ?? [];
  if (extensionIds.length === 0) {
    context.err(
      "Pass --extension-id <id>. Claymod settings > Local agent shows the exact command.",
    );
    return 2;
  }
  const bad = extensionIds.find((id) => !EXTENSION_ID.test(id));
  if (bad) {
    context.err(
      `"${bad}" isn't a Chrome extension ID (32 letters a–p). Copy it from Claymod settings > Local agent.`,
    );
    return 2;
  }
  const browsers = chooseBrowsers(values.browser, context);
  if (typeof browsers === "string") {
    context.err(browsers);
    return 2;
  }

  const plan = planInstall({ machine: context, self: context, browsers, extensionIds });
  for (const file of plan.files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, { mode: file.mode });
    await chmod(file.path, file.mode);
  }
  for (const entry of plan.registry) {
    if (
      !(await reg(context, ["add", entry.key, "/ve", "/t", "REG_SZ", "/d", entry.manifest, "/f"]))
    ) {
      context.err(
        `Couldn't write the registry key ${entry.key}. Run the command again from a normal (non-admin) terminal.`,
      );
      return 1;
    }
  }
  await writeConfig(configDir(context), {
    extensionIds,
    browsers,
    hostPath: plan.hostPath,
    path: context.env[pathKey(context.env)],
  });
  for (const browser of browsers) {
    context.out(`✓ Registered with ${BROWSER_LABELS[browser]}: ${manifestPath(browser, context)}`);
  }
  context.out(`  Allowed extension: ${extensionIds.join(", ")}`);
  context.out("Next: open Claymod settings, choose Local agent and click Test connection.");
  return 0;
};

export const UNINSTALL_HELP = `Usage: claymod-bridge uninstall

Removes the native messaging registration from every browser, Claymod's bridge settings and
the API keys saved in the system keychain.`;

export const uninstall: Command = async (args, context) => {
  if (args.includes("--help") || args.includes("-h")) {
    context.out(UNINSTALL_HELP);
    return 0;
  }
  for (const browser of browsersFor(context.platform)) {
    const path = manifestPath(browser, context);
    if (existsSync(path)) {
      await rm(path, { force: true });
      context.out(`✓ Removed ${BROWSER_LABELS[browser]} registration: ${path}`);
    }
    if (context.platform === "win32") await reg(context, ["delete", registryKey(browser), "/f"]);
  }
  for (const agent of AGENT_IDS) {
    if (await context.keys.delete(agent).catch(() => false))
      context.out(`✓ Deleted the saved ${agent} key`);
  }
  await rm(configDir(context), { recursive: true, force: true });
  context.out("claymod-bridge is unregistered. You can delete the claymod-bridge binary now.");
  return 0;
};
