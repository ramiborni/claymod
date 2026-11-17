import { renderOutline } from "@claymod/core/snapshot";
import { useJitlessZod } from "@claymod/core/zod-config";
import type { PageMessage, PageSnapshot } from "@/lib/page/messages";
import { outlineTree } from "@/lib/page/outline";
import { pickElement } from "@/lib/page/picker";

declare global {
  interface Window {
    __claymodContentLoaded?: boolean;
  }
}

/**
 * Injected on demand with chrome.scripting (never declared for all sites): page snapshot and
 * element picker for the create flow.
 */
export default defineContentScript({
  matches: [],
  registration: "runtime",
  noScriptStartedPostMessage: true,
  main() {
    if (window.__claymodContentLoaded) return;
    window.__claymodContentLoaded = true;
    useJitlessZod();
    let activePick: ReturnType<typeof pickElement> | undefined;

    browser.runtime.onMessage.addListener((message: PageMessage, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return;
      switch (message.type) {
        case "claymod:ping":
          sendResponse(true);
          return;
        case "claymod:snapshot": {
          const snapshot: PageSnapshot = {
            url: location.href,
            title: document.title,
            outline: renderOutline(outlineTree(document.body ?? document.documentElement)),
          };
          sendResponse(snapshot);
          return;
        }
        case "claymod:pick":
          activePick?.cancel();
          activePick = pickElement();
          void activePick.result.then((picked) => sendResponse(picked));
          return true; // answer asynchronously
        case "claymod:cancelPick":
          activePick?.cancel();
          sendResponse(true);
          return;
      }
    });
  },
});
