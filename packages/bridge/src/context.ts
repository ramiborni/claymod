import type { Env } from "./env";
import type { KeyStore } from "./keys";
import type { Machine } from "./paths";
import type { Which } from "./runners/locate";
import type { Spawn } from "./runners/spawn";

/** Everything a command touches outside its own logic, so commands are tested in-process. */
export interface CommandContext extends Machine {
  env: Env;
  out(line: string): void;
  err(line: string): void;
  keys: KeyStore;
  spawn: Spawn;
  which: Which;
  tmpRoot: string;
  /** The running executable: the compiled binary, or bun in development. */
  execPath: string;
  /** The entry script when running from source (bun src/cli.ts). */
  mainScript: string;
  /** Reads a secret typed by the user (hidden) or piped in. */
  readSecret(prompt: string): Promise<string>;
  /** Native messaging host I/O (stdin / stdout). */
  stdio: { input: AsyncIterable<Uint8Array>; write(frame: Uint8Array): Promise<void> };
  version: string;
  /** Tracing variables removed at startup (reported by doctor). */
  clearedTracing: string[];
}

export type Command = (args: string[], context: CommandContext) => Promise<number>;
