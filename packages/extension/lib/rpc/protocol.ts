import type { AgentId, HelloResult } from "@claymod/core/bridge-protocol";
import type { ModDraft } from "@claymod/core/mod";
import type { ProviderConfig } from "@claymod/core/provider-config";
import type { PickedElement } from "@claymod/core/snapshot";

/** Every request the side panel and options page can send to the background. */
export interface RpcMethods {
  status: { req: Record<string, never>; res: { configured: boolean; label: string } };
  testConnection: { req: { config: ProviderConfig }; res: { model: string } };
  // claymod-bridge (local agents). API keys go to the OS keychain and never come back.
  bridgeHello: { req: Record<string, never>; res: HelloResult };
  bridgeSetKey: { req: { agent: AgentId; key: string }; res: null };
  bridgeDeleteKey: { req: { agent: AgentId }; res: null };
  pick: { req: { tabId: number }; res: PickedElement | null };
  cancelPick: { req: { tabId: number }; res: null };
  generate: {
    req: { tabId: number; request: string; pickedElement?: PickedElement | undefined };
    res: GeneratedDraft;
  };
  preview: { req: { tabId: number; draft: ModDraft }; res: PreviewResult };
  discard: { req: { tabId: number }; res: null };
  keep: {
    req: { tabId: number; generated: GeneratedDraft; jsReviewed: boolean };
    res: { id: string; name: string };
  };
  // Mod manager
  listMods: { req: { tabId?: number | undefined }; res: ManagerView };
  setEnabled: { req: { id: string; enabled: boolean }; res: null };
  rename: { req: { id: string; name: string }; res: null };
  deleteMod: { req: { id: string }; res: null };
  undo: { req: { id: string }; res: null };
  approveJs: { req: { id: string }; res: null };
  setSitePaused: { req: { host: string; paused: boolean }; res: null };
  exportMods: { req: { ids?: string[] | undefined }; res: { fileName: string; json: string } };
  importMods: { req: { text: string }; res: { imported: string[]; errors: string[] } };
  repair: {
    req: { tabId: number; modId: string };
    res: { generated: GeneratedDraft; preview: PreviewResult };
  };
  saveRepair: {
    req: { tabId: number; modId: string; generated: GeneratedDraft; jsReviewed: boolean };
    res: { name: string; version: number };
  };
}

export interface ModSummary {
  id: string;
  name: string;
  description: string;
  matches: string[];
  css?: string | undefined;
  js?: string | undefined;
  version: number;
  canUndo: boolean;
  enabled: boolean;
  jsApproved: boolean;
  health: "healthy" | "needs-repair";
  /** Check selectors that failed on the last visit. */
  lastFailed: string[];
  /** Matches the page in the target tab. */
  appliesHere: boolean;
  /** Claymod has host permission for all of the mod's sites. */
  hasAccess: boolean;
}

export interface ManagerView {
  mods: ModSummary[];
  /** The target tab's site, when Claymod can see it. */
  site: { host: string; paused: boolean } | null;
  userScripts: { available: boolean; help: string };
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
