import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import {
  type AgentResult,
  type AgentToolName,
  agentToolNameSchema,
} from "@claymod/core/bridge-protocol";
import * as z from "zod";

/** One request per line from `claymod-bridge mcp`; one response line per request. */
const linkRequestSchema = z.strictObject({
  token: z.string(),
  id: z.string().min(1).max(64),
  tool: agentToolNameSchema,
  args: z.unknown(),
  client: z.string().max(100),
});

export const MAX_LINE_BYTES = 8 * 1024 * 1024;

export type OnCall = (tool: AgentToolName, args: unknown, client: string) => Promise<AgentResult>;

export interface LinkServer {
  close(): Promise<void>;
}

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function serveConnection(socket: Socket, token: string, onCall: OnCall): void {
  let buffer = "";
  const reply = (id: string, result: AgentResult) => {
    if (!socket.destroyed) socket.write(`${JSON.stringify({ id, ...result })}\n`);
  };
  socket.setEncoding("utf8");
  socket.on("error", () => socket.destroy());
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE_BYTES) return void socket.destroy();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      let parsed: z.infer<typeof linkRequestSchema>;
      try {
        parsed = linkRequestSchema.parse(JSON.parse(line));
      } catch {
        reply("", { ok: false, error: "Malformed request." });
        continue;
      }
      if (!sameToken(parsed.token, token)) {
        reply(parsed.id, { ok: false, error: "Wrong token. Restart the agent's MCP server." });
        socket.end();
        return;
      }
      onCall(parsed.tool, parsed.args, parsed.client)
        .then((result) => reply(parsed.id, result))
        .catch((error) => reply(parsed.id, { ok: false, error: String(error) }));
    }
  });
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(path, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

/**
 * Listens on the user-only socket and writes a fresh token (mode 0600). A previous host's
 * socket is replaced: the newest Chrome connection wins.
 */
export async function startLinkServer(options: {
  socket: string;
  tokenFile: string;
  dir: string;
  platform: NodeJS.Platform;
  onCall: OnCall;
}): Promise<LinkServer> {
  const token = randomBytes(32).toString("hex");
  await mkdir(options.dir, { recursive: true, mode: 0o700 });
  if (options.platform !== "win32") {
    await chmod(options.dir, 0o700);
    await rm(options.socket, { force: true });
  }
  await writeFile(options.tokenFile, token, { mode: 0o600 });
  await chmod(options.tokenFile, 0o600);
  const server: Server = createServer((socket) => serveConnection(socket, token, options.onCall));
  try {
    await listen(server, options.socket);
  } catch (error) {
    // Another host (an older Chrome connection) holds the socket: the newest one takes over.
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || options.platform === "win32") {
      throw error;
    }
    await rm(options.socket, { force: true });
    await listen(server, options.socket);
  }
  if (options.platform !== "win32") await chmod(options.socket, 0o600);
  return {
    async close() {
      const current = await readFile(options.tokenFile, "utf8").catch(() => "");
      if (current !== token) {
        // A newer host took over this path. Closing a Unix socket server deletes its path,
        // which is now the newer host's, so just let go: this only runs as the host exits.
        server.unref();
        return;
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(options.tokenFile, { force: true });
      if (options.platform !== "win32") await rm(options.socket, { force: true });
    },
  };
}

export type { AgentResult };
