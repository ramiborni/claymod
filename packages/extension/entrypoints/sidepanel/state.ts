import type { PickedElement } from "@claymod/core/snapshot";
import type {
  AgentRequestView,
  GeneratedDraft,
  ManagerView,
  PreviewResult,
} from "@/lib/rpc/protocol";

/** Create a new mod, repair one, or review an agent's proposal. All end in the same preview. */
export type Purpose =
  | { kind: "create" }
  | { kind: "repair"; modId: string; modName: string }
  | {
      kind: "agent";
      requestId: string;
      tool: AgentRequestView["tool"];
      client: string;
      replaces?: { id: string; name: string } | undefined;
    };

export interface PreviewScreen {
  name: "preview";
  purpose: Purpose;
  tabId: number;
  generated: GeneratedDraft;
  preview: PreviewResult;
  showCode: boolean;
  /** The user has seen the JS: it ran in the preview or they opened the code. */
  jsReviewed: boolean;
  saving: boolean;
  /** Before/After: false while the user looks at the page without the change. */
  showingChange: boolean;
}

export type Screen =
  | { name: "compose" }
  | { name: "picking" }
  | { name: "generating"; label: string; stage: "writing" | "previewing" }
  | PreviewScreen
  | { name: "saved"; message: string }
  | { name: "error"; message: string };

export type Filter = "site" | "all";

export interface ManagerUi {
  view: ManagerView | null;
  filter: Filter;
  /** Mods whose details are open (description, sites, actions). */
  details: Set<string>;
  /** Mods whose code is expanded. Viewing the code is what unlocks "Enable JavaScript". */
  expanded: Set<string>;
  renaming: string | null;
  confirmDelete: string | null;
  notice: { kind: "ok" | "error"; text: string } | null;
}

export interface PanelState {
  screen: Screen;
  request: string;
  picked: PickedElement | null;
  provider: { configured: boolean; label: string };
  /** Shown above the preview when saving fails, so the preview stays usable. */
  saveError?: string | undefined;
  manager: ManagerUi;
  /** Previews and saves agents asked for (MCP), waiting for the user. */
  agentRequests: AgentRequestView[];
}

export const initialState: PanelState = {
  screen: { name: "compose" },
  request: "",
  picked: null,
  provider: { configured: false, label: "" },
  agentRequests: [],
  manager: {
    view: null,
    filter: "site",
    details: new Set(),
    expanded: new Set(),
    renaming: null,
    confirmDelete: null,
    notice: null,
  },
};
