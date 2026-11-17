import { homedir, tmpdir } from "node:os";
import packageJson from "../package.json";
import type { CommandContext } from "./context";
import { clearTracingEnv } from "./env";
import { envOnlyKeyStore, osKeyStore } from "./keys";
import { bunWhich } from "./runners/locate";
import { bunSpawn } from "./runners/spawn";

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** Reads a line from the terminal without echoing it, or all of stdin when it is piped. */
async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return readAll(Bun.stdin.stream());
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  let value = "";
  try {
    for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") process.exit(130);
        if (char === "\r" || char === "\n") return value;
        value = char === "\u007f" || char === "\b" ? value.slice(0, -1) : value + char;
      }
    }
    return value;
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stderr.write("\n");
  }
}

function writeStdout(frame: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) =>
    process.stdout.write(frame, (error) => (error ? reject(error) : resolve())),
  );
}

/** The real machine: environment (with tracing cleared), keychain, processes, stdio. */
export function systemContext(): CommandContext {
  const clearedTracing = clearTracingEnv(process.env);
  return {
    platform: process.platform,
    home: homedir(),
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    keys: process.env.CLAYMOD_BRIDGE_NO_KEYCHAIN === "1" ? envOnlyKeyStore : osKeyStore,
    spawn: bunSpawn,
    which: bunWhich,
    tmpRoot: tmpdir(),
    execPath: process.execPath,
    mainScript: Bun.main,
    readSecret,
    stdio: { input: Bun.stdin.stream(), write: writeStdout },
    version: packageJson.version,
    clearedTracing,
  };
}
