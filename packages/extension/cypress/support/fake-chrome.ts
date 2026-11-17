import type { ClientMessage, RpcMethod, RpcResult, ServerMessage } from "../../lib/rpc/protocol";

type Handler = (payload: unknown) => RpcResult<unknown>;

export interface FakeChromeOptions {
  /** Answers for background RPC calls. Missing methods answer with an error. */
  rpc?: Partial<Record<RpcMethod, RpcResult<unknown> | Handler>>;
  /** Methods whose answer waits until the test calls release(method). */
  hold?: RpcMethod[];
  storage?: Record<string, unknown>;
  permissionGranted?: boolean;
}

export interface FakeChromeState {
  calls: Array<{ method: RpcMethod; payload: unknown }>;
  cancelled: number[];
  stored: Record<string, unknown>;
  release(method: RpcMethod): void;
}

declare global {
  interface Window {
    chrome: unknown;
    fake: FakeChromeState;
  }
}

/**
 * A stand-in for the extension APIs the side panel and options page use, installed before the
 * page's scripts run. The background is replaced by scripted RPC answers.
 */
export function installFakeChrome(win: Window, options: FakeChromeOptions = {}): void {
  const listeners: Array<(message: ServerMessage) => void> = [];
  const held = new Map<RpcMethod, Array<() => void>>();
  const stored: Record<string, unknown> = { ...options.storage };
  const fake: FakeChromeState = {
    calls: [],
    cancelled: [],
    stored,
    release(method) {
      for (const answer of held.get(method) ?? []) answer();
      held.delete(method);
    },
  };

  const answer = (method: RpcMethod, payload: unknown): RpcResult<unknown> => {
    const configured = options.rpc?.[method];
    if (configured === undefined) return { ok: false, error: `No fake answer for ${method}` };
    return typeof configured === "function" ? configured(payload) : configured;
  };

  const port = {
    onMessage: {
      addListener: (listener: (message: ServerMessage) => void) => listeners.push(listener),
    },
    onDisconnect: { addListener: () => {} },
    postMessage(message: ClientMessage) {
      if (message.kind === "cancel") fake.cancelled.push(message.id);
      if (message.kind !== "call") return;
      fake.calls.push({ method: message.method, payload: message.payload });
      const reply = () => {
        const result = answer(message.method, message.payload);
        for (const listener of listeners) listener({ kind: "result", id: message.id, result });
      };
      if (options.hold?.includes(message.method)) {
        held.set(message.method, [...(held.get(message.method) ?? []), reply]);
      } else {
        setTimeout(reply, 0);
      }
    },
  };

  win.fake = fake;
  win.chrome = {
    runtime: {
      id: "fakeextensionid",
      connect: () => port,
      getURL: (path: string) => `chrome-extension://fakeextensionid/${path}`,
      openOptionsPage: cy.stub().as("openOptionsPage").resolves(undefined),
    },
    storage: {
      local: {
        get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
        set: async (items: Record<string, unknown>) => Object.assign(stored, items),
      },
      onChanged: { addListener: () => {} },
    },
    tabs: { query: async () => [{ id: 7, windowId: 1 }] },
    permissions: {
      request: cy
        .stub()
        .as("permissionsRequest")
        .resolves(options.permissionGranted ?? true),
    },
  };
}
