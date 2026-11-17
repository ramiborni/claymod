/** Keeps a runaway agent from filling memory; real answers are a few kilobytes. */
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

export interface SpawnRequest {
  command: string[];
  cwd: string;
  env: Record<string, string>;
  stdin: string;
  signal: AbortSignal;
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type Spawn = (request: SpawnRequest) => Promise<SpawnResult>;

async function readCapped(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    if (bytes <= MAX_CAPTURE_BYTES) text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

/** Bun.spawn with stdin text, captured output and kill-on-abort. */
export const bunSpawn: Spawn = async ({ command, cwd, env, stdin, signal }) => {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const kill = () => child.kill();
  signal.addEventListener("abort", kill, { once: true });
  try {
    try {
      child.stdin.write(stdin);
      await child.stdin.end();
    } catch {
      // The agent exited before reading its input; its exit code and stderr explain why.
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      readCapped(child.stdout),
      readCapped(child.stderr),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    signal.removeEventListener("abort", kill);
  }
};
