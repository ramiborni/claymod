import type { PickedElement } from "@claymod/core/snapshot";
import type { GeneratedDraft, PreviewResult } from "@/lib/rpc/protocol";

export type Screen =
  | { name: "compose" }
  | { name: "picking" }
  | { name: "generating" }
  | {
      name: "preview";
      tabId: number;
      generated: GeneratedDraft;
      preview: PreviewResult;
      showCode: boolean;
      keeping: boolean;
    }
  | { name: "saved"; modName: string }
  | { name: "error"; message: string; back: "compose" | "preview" };

export interface PanelState {
  screen: Screen;
  request: string;
  picked: PickedElement | null;
  provider: { configured: boolean; label: string };
  /** Shown above the preview when Keep fails, so the preview stays usable. */
  keepError?: string | undefined;
}

export const initialState: PanelState = {
  screen: { name: "compose" },
  request: "",
  picked: null,
  provider: { configured: false, label: "" },
};
