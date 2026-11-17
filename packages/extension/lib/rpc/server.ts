import type {
  ClientMessage,
  RpcMethod,
  RpcRequest,
  RpcResponse,
  RpcResult,
  ServerMessage,
} from "./protocol";
import { RPC_PORT } from "./protocol";

export type RpcHandlers = {
  [M in RpcMethod]: (
    payload: RpcRequest<M>,
    signal: AbortSignal,
  ) => Promise<RpcResult<RpcResponse<M>>>;
};

function unexpected(error: unknown): RpcResult<never> {
  console.error("Claymod RPC handler failed", error);
  return {
    ok: false,
    error: "Something went wrong in Claymod. Try again, or report a bug if it keeps happening.",
  };
}

/** Serves RPC calls from Claymod's own pages. Content scripts and other extensions can't connect. */
export function serveRpc(handlers: RpcHandlers): void {
  browser.runtime.onConnect.addListener((port) => {
    // Only Claymod's own pages (side panel, options) have a chrome-extension://<id>/ URL;
    // content scripts report the web page's URL.
    const fromOwnPage = port.sender?.url?.startsWith(browser.runtime.getURL("")) ?? false;
    if (port.name !== RPC_PORT || port.sender?.id !== browser.runtime.id || !fromOwnPage) return;
    const controllers = new Map<number, AbortController>();
    port.onDisconnect.addListener(() => {
      for (const controller of controllers.values()) controller.abort();
    });
    port.onMessage.addListener(async (message: ClientMessage) => {
      if (message.kind === "cancel") controllers.get(message.id)?.abort();
      if (message.kind !== "call") return;
      const controller = new AbortController();
      controllers.set(message.id, controller);
      const handler = handlers[message.method] as (
        payload: unknown,
        signal: AbortSignal,
      ) => Promise<RpcResult<unknown>>;
      const result = await handler(message.payload, controller.signal).catch(unexpected);
      controllers.delete(message.id);
      const reply: ServerMessage = { kind: "result", id: message.id, result };
      try {
        port.postMessage(reply);
      } catch {
        // The page closed before the answer arrived.
      }
    });
  });
}
