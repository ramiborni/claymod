import type { ModDraft } from "@claymod/core/mod";
import type { ProviderConfig } from "@claymod/core/provider-config";
import type { PickedElement } from "@claymod/core/snapshot";

/** Every request the side panel and options page can send to the background. */
export interface RpcMethods {
  status: { req: Record<string, never>; res: { configured: boolean; label: string } };
  testConnection: { req: { config: ProviderConfig }; res: { model: string } };
  pick: { req: { tabId: number }; res: PickedElement | null };
  cancelPick: { req: { tabId: number }; res: null };
  generate: {
    req: { tabId: number; request: string; pickedElement?: PickedElement | undefined };
    res: GeneratedDraft;
  };
  preview: { req: { tabId: number; draft: ModDraft }; res: PreviewResult };
  discard: { req: { tabId: number }; res: null };
  keep: { req: { tabId: number; generated: GeneratedDraft }; res: { id: string; name: string } };
}

export type RpcMethod = keyof RpcMethods;
export type RpcRequest<M extends RpcMethod> = RpcMethods[M]["req"];
export type RpcResponse<M extends RpcMethod> = RpcMethods[M]["res"];

/** Errors are plain, user-facing strings that say what to do next. */
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GeneratedDraft {
  draft: ModDraft;
  provider: string;
  model: string;
}

export interface PreviewResult {
  css: boolean;
  js: "none" | "ran" | "unavailable";
  /** Set when js is "unavailable": how to turn user scripts on. */
  jsHelp?: string | undefined;
}

export const RPC_PORT = "claymod-rpc";

export type ClientMessage =
  | { kind: "call"; id: number; method: RpcMethod; payload: unknown }
  | { kind: "cancel"; id: number }
  | { kind: "heartbeat" };

export type ServerMessage = { kind: "result"; id: number; result: RpcResult<unknown> };
