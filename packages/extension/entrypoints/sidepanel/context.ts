import type { RpcClient } from "@/lib/rpc/client";
import type { PanelState } from "./state";

export interface PanelContext {
  rpc: RpcClient;
  get(): PanelState;
  update(patch: Partial<PanelState>): void;
  /** Re-reads the mod list (after any change). */
  refreshMods(): Promise<void>;
}
