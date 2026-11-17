import { evaluateHealth, recordCheckRun } from "@claymod/core/health";
import { updateLibrary } from "@/lib/storage";

export interface CheckReport {
  type: "claymod:checks";
  results: Array<{ modId: string; failedSelectors: string[] }>;
}

export const isCheckReport = (message: unknown): message is CheckReport =>
  typeof message === "object" &&
  message !== null &&
  "type" in message &&
  message.type === "claymod:checks";

const RED = "#c62828";
const ACCENT = "#6b4dff";

/** "!" when a mod on this page needs repair, otherwise the number of active mods. */
async function updateBadge(tabId: number, active: number, needsRepair: boolean): Promise<void> {
  const text = needsRepair ? "!" : active > 0 ? String(active) : "";
  await browser.action.setBadgeText({ tabId, text }).catch(() => {});
  await browser.action
    .setBadgeBackgroundColor({ tabId, color: needsRepair ? RED : ACCENT })
    .catch(() => {});
}

/** Records one visit's check results per mod and updates health and the toolbar badge. */
export async function recordChecks(report: CheckReport, tabId: number): Promise<void> {
  const at = new Date().toISOString();
  const needsRepair = await updateLibrary((library) => {
    let anyNeedsRepair = false;
    for (const { modId, failedSelectors } of report.results) {
      const state = library.state[modId];
      if (!state) continue;
      state.checkRuns = recordCheckRun(state.checkRuns, { at, failedSelectors });
      state.health = evaluateHealth(state.checkRuns);
      anyNeedsRepair ||= state.health === "needs-repair";
    }
    return anyNeedsRepair;
  });
  await updateBadge(tabId, report.results.length, needsRepair);
}
