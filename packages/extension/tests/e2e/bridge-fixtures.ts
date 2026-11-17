/**
 * Fixtures for the local-agent path with nothing faked but the agent: the real extension talks
 * to the real claymod-bridge over Chrome native messaging, and the bridge runs a fake `claude`.
 * Chromium gets a throwaway HOME, so `claymod-bridge install` registers it there, never in the
 * real profile.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type BrowserContext, test as base, chromium, type Worker } from "@playwright/test";
import { extensionPath } from "./fixtures";
import { type MockServer, startMockServer } from "./mock-server";

export { extensionPath };

const bridgeRoot = path.resolve(import.meta.dirname, "../../../bridge");
const CLI = path.join(bridgeRoot, "src/cli.ts");
const FAKE_AGENT = path.join(bridgeRoot, "tests/fixtures/fake-agent.ts");
// Playwright runs on Node; the bridge and the fake agent run on Bun. Its "chromium" is Chrome for
// Testing, which reads native messaging hosts from its own folder since Chrome 146.
const BUN = spawnSync("bun", ["-e", "process.stdout.write(process.execPath)"]).stdout.toString();

/** Chrome derives an unpacked extension's ID from its absolute path. */
export function unpackedExtensionId(dir: string): string {
  const hex = createHash("sha256").update(realpathSync(dir)).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + Number.parseInt(c, 16))).join("");
}

interface Fixtures {
  home: string;
  agents: string;
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  server: MockServer;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  home: async ({}, use) => {
    const root = mkdtempSync(path.join(tmpdir(), "claymod-bridge-e2e-"));
    await use(root);
    rmSync(root, { recursive: true, force: true });
  },
  agents: async ({ home }, use) => {
    const bin = path.join(home, "agents-bin");
    mkdirSync(bin);
    const claude = path.join(bin, "claude");
    writeFileSync(claude, `#!/bin/sh\nexec '${BUN}' '${FAKE_AGENT}' '${bin}' claude "$@"\n`);
    chmodSync(claude, 0o755);
    const id = unpackedExtensionId(extensionPath);
    const install = spawnSync(
      BUN,
      [CLI, "install", "--browser", "chrome-for-testing", "--extension-id", id],
      {
        env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, CLAYMOD_BRIDGE_NO_KEYCHAIN: "1" },
      },
    );
    if (install.status !== 0) throw new Error(install.stderr.toString());
    // On Linux, Chrome reads user-level hosts from <user data dir>/NativeMessagingHosts (the
    // documented ~/.config/... path is that folder for the default profile). Playwright uses its
    // own user data dir, so the manifest `install` wrote is copied there.
    const hosts = path.join(home, "profile", "NativeMessagingHosts");
    mkdirSync(hosts, { recursive: true });
    copyFileSync(
      path.join(home, ".config/google-chrome-for-testing/NativeMessagingHosts/claymod.bridge.json"),
      path.join(hosts, "claymod.bridge.json"),
    );
    await use(bin);
  },
  context: async ({ home, agents }, use) => {
    void agents;
    const context = await chromium.launchPersistentContext(path.join(home, "profile"), {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      // Chrome starts the bridge with its own environment: a short PATH, no agent folder.
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        CLAYMOD_BRIDGE_NO_KEYCHAIN: "1",
        LANGSMITH_TRACING: "true",
      },
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  server: async ({}, use) => {
    const server = await startMockServer();
    await use(server);
    await server.close();
  },
});
export const expect = test.expect;

export const calls = (bin: string) =>
  readFileSync(path.join(bin, "calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as { args: string[]; stdin: string; env: Record<string, string | null> },
    );
