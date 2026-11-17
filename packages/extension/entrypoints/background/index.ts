import { useJitlessZod } from "@claymod/core";
import { syncAgentLink } from "@/lib/background/agent-link";
import { isCheckReport, recordChecks } from "@/lib/background/checks";
import { handlers } from "@/lib/background/handlers";
import { syncRegistrations } from "@/lib/background/sync";
import { serveRpc } from "@/lib/rpc/server";
import { KEYS } from "@/lib/storage";

export default defineBackground(() => {
  useJitlessZod();
  // Opening the panel from action.onClicked (not openPanelOnActionClick) guarantees the click
  // grants activeTab for the current page. sidePanel.open must run inside the click handler.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  browser.action.onClicked.addListener((tab) => {
    void browser.sidePanel.open({ windowId: tab.windowId });
  });
  serveRpc(handlers);

  // Health reports from the apply content script (one per visit or SPA navigation).
  browser.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    if (sender.id !== browser.runtime.id || tabId === undefined || !isCheckReport(message)) return;
    void recordChecks(message, tabId);
    void syncRegistrations(); // picks up user scripts being switched on; cheap when nothing changed
  });

  // Keep Chrome's registered scripts in step with stored mods, settings and permissions.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (KEYS.mods in changes || KEYS.modState in changes || KEYS.pausedSites in changes)
      void syncRegistrations();
    if (KEYS.agentAccess in changes) void syncAgentLink();
  });
  browser.permissions.onAdded.addListener(() => {
    void syncRegistrations(true);
    void syncAgentLink();
  });
  browser.permissions.onRemoved.addListener(() => void syncRegistrations(true));
  browser.runtime.onInstalled.addListener(() => void syncRegistrations(true));
  browser.runtime.onStartup.addListener(() => void syncRegistrations(true));
  void syncRegistrations(true);
  // M5: reopen the agent link (MCP) if the user turned it on.
  void syncAgentLink();
});
