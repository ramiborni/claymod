import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "./context";
import { memoryKeyStore } from "./keys";
import type { SpawnRequest, SpawnResult } from "./runners/spawn";

export interface TestContext extends CommandContext {
  stdout: string[];
  stderr: string[];
  spawned: SpawnRequest[];
}

/** A command context with a throwaway home folder and no real processes, keychain or stdio. */
export function testContext(overrides: Partial<CommandContext> = {}): TestContext {
  const home = mkdtempSync(join(tmpdir(), "claymod-home-"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const spawned: SpawnRequest[] = [];
  return {
    stdout,
    stderr,
    spawned,
    platform: "linux",
    home,
    env: { PATH: "/usr/bin", HOME: home },
    out: (line) => void stdout.push(line),
    err: (line) => void stderr.push(line),
    keys: memoryKeyStore(),
    spawn: async (request): Promise<SpawnResult> => {
      spawned.push(request);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    which: () => undefined,
    tmpRoot: tmpdir(),
    execPath: "/opt/claymod/claymod-bridge",
    mainScript: "/$bunfs/root/claymod-bridge",
    readSecret: async () => "",
    stdio: { input: (async function* () {})(), write: async () => {} },
    version: "1.2.3",
    clearedTracing: [],
    ...overrides,
  };
}
