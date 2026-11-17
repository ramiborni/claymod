import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import type { AgentResult, AgentToolName } from "@claymod/core/bridge-protocol";

export const NOT_LISTENING =
  "Claymod isn't accepting agents right now. In Chrome, open Claymod settings and turn on “Let agents use Claymod (MCP)”, then keep Chrome open.";

export interface LinkTarget {
  socket: string;
  tokenFile: string;
}

/** Sends one tool call to the Claymod host over the local socket and waits for the answer. */
export async function callLink(
  target: LinkTarget,
  call: { tool: AgentToolName; args: unknown; client: string },
  timeoutMs: number,
): Promise<AgentResult> {
  let token: string;
  try {
    token = (await readFile(target.tokenFile, "utf8")).trim();
  } catch {
    return { ok: false, error: NOT_LISTENING };
  }
  const id = randomUUID();
  return new Promise((resolve) => {
    let buffer = "";
    let settled = false;
    const socket = connect(target.socket);
    const finish = (result: AgentResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: "Claymod didn't answer in time. Try again." }),
      timeoutMs,
    );
    socket.setEncoding("utf8");
    socket.on("error", () => finish({ ok: false, error: NOT_LISTENING }));
    socket.on("close", () => finish({ ok: false, error: NOT_LISTENING }));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const message = JSON.parse(buffer.slice(0, newline)) as { id: string } & AgentResult;
        if (message.id !== id)
          return finish({ ok: false, error: "Claymod sent an unexpected answer." });
        finish(
          message.ok ? { ok: true, value: message.value } : { ok: false, error: message.error },
        );
      } catch {
        finish({ ok: false, error: "Claymod sent an unreadable answer." });
      }
    });
    socket.on("connect", () => socket.write(`${JSON.stringify({ token, id, ...call })}\n`));
  });
}
