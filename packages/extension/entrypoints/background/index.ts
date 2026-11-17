import { useJitlessZod } from "@claymod/core";
import { handlers } from "@/lib/background/handlers";
import { serveRpc } from "@/lib/rpc/server";

export default defineBackground(() => {
  useJitlessZod();
  // Opening the panel from action.onClicked (not openPanelOnActionClick) guarantees the click
  // grants activeTab for the current page. sidePanel.open must run inside the click handler.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  browser.action.onClicked.addListener((tab) => {
    void browser.sidePanel.open({ windowId: tab.windowId });
  });
  serveRpc(handlers);
});
