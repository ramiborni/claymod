import type {
  ClientMessage,
  RpcMethod,
  RpcRequest,
  RpcResponse,
  RpcResult,
  ServerMessage,
} from "./protocol";
import { RPC_PORT } from "./protocol";

// Messages on an open port keep the MV3 service worker alive during long model calls.
const HEARTBEAT_MS = 20_000;

type Pending = (result: RpcResult<unknown>) => void;

/** Talks to the background over one long-lived port. Used by extension pages only. */
export function createRpcClient() {
  let port: Browser.runtime.Port | undefined;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const connect = () => {
    const opened = browser.runtime.connect({ name: RPC_PORT });
    opened.onMessage.addListener((message: ServerMessage) => {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
      if (pending.size === 0) stopHeartbeat();
    });
    opened.onDisconnect.addListener(() => {
      port = undefined;
      for (const resolve of pending.values()) {
        resolve({ ok: false, error: "Claymod's background stopped unexpectedly. Try again." });
      }
      pending.clear();
      stopHeartbeat();
    });
    return opened;
  };

  const post = (message: ClientMessage) => {
    port ??= connect();
    port.postMessage(message);
  };

  const startHeartbeat = () => {
    heartbeat ??= setInterval(() => post({ kind: "heartbeat" }), HEARTBEAT_MS);
  };
  const stopHeartbeat = () => {
    clearInterval(heartbeat);
    heartbeat = undefined;
  };

  function call<M extends RpcMethod>(
    method: M,
    payload: RpcRequest<M>,
    signal?: AbortSignal,
  ): Promise<RpcResult<RpcResponse<M>>> {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve as Pending);
      signal?.addEventListener("abort", () => post({ kind: "cancel", id }), { once: true });
      post({ kind: "call", id, method, payload });
      startHeartbeat();
    });
  }

  return { call };
}

export type RpcClient = ReturnType<typeof createRpcClient>;
