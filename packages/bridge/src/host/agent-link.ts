import { randomUUID } from "node:crypto";
import { err, ok, type Result } from "@claymod/core";
import {
  AGENT_APPROVAL_TIMEOUT_MS,
  type AgentCall,
  type AgentResult,
  type BridgeError,
} from "@claymod/core/bridge-protocol";
import { type LinkServer, startLinkServer } from "../mcp/link-server";

/** Time for the extension to answer one agent call, including the user's approval. */
export const AGENT_CALL_TIMEOUT_MS = AGENT_APPROVAL_TIMEOUT_MS + 10_000;

export interface AgentLink {
  start(): Promise<Result<{ socket: string }, BridgeError>>;
  resolve(callId: string, result: AgentResult): void;
  close(): Promise<void>;
}

/**
 * Turns calls arriving on the local socket into `agentCall` messages to the extension, and the
 * extension's `agentResult` messages back into answers. Lives as long as the native host.
 */
export function createAgentLink(options: {
  socket: string;
  tokenFile: string;
  dir: string;
  platform: NodeJS.Platform;
  /** Sends a message to the extension; false when it couldn't be sent. */
  push(message: AgentCall): boolean;
  timeoutMs?: number;
}): AgentLink {
  let starting: Promise<Result<{ socket: string }, BridgeError>> | undefined;
  let server: LinkServer | undefined;
  const pending = new Map<string, { done(result: AgentResult): void }>();

  const onCall = (tool: AgentCall["tool"], args: unknown, client: string) =>
    new Promise<AgentResult>((resolve) => {
      const callId = randomUUID();
      const timer = setTimeout(
        () => done({ ok: false, error: "Claymod didn't answer in time. Try again." }),
        options.timeoutMs ?? AGENT_CALL_TIMEOUT_MS,
      );
      const done = (result: AgentResult) => {
        clearTimeout(timer);
        pending.delete(callId);
        resolve(result);
      };
      pending.set(callId, { done });
      if (!options.push({ type: "agentCall", callId, tool, args, client })) {
        done({ ok: false, error: "This request is too large to send to Claymod." });
      }
    });

  return {
    start() {
      // Concurrent "serve" requests share one start, so they never race for the socket.
      starting ??= startLinkServer({ ...options, onCall }).then(
        (started) => {
          server = started;
          return ok({ socket: options.socket });
        },
        (error) => {
          starting = undefined;
          return err({
            kind: "link" as const,
            message: `claymod-bridge couldn't open its local socket (${String(error)}). Run 'claymod-bridge doctor'.`,
          });
        },
      );
      return starting;
    },
    resolve(callId, result) {
      pending.get(callId)?.done(result);
    },
    async close() {
      for (const call of [...pending.values()]) {
        call.done({ ok: false, error: "Chrome closed the connection to Claymod." });
      }
      await starting;
      await server?.close();
      server = undefined;
      starting = undefined;
    },
  };
}
