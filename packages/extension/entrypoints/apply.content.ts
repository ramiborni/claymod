import { useJitlessZod } from "@claymod/core/zod-config";
import type { CheckReport } from "@/lib/background/checks";
import { modsForUrl } from "@/lib/mods/selection";
import { domReady, failedSelectors, waitForQuiet } from "@/lib/page/checks";
import { createStyleManager } from "@/lib/page/styles";
import { getLibrary, KEYS, type Library } from "@/lib/storage";

const QUIET_MS = 600;
const SETTLE_MAX_MS = 4000;
const RECHECK_MAX_MS = 5000;

/**
 * Registered at runtime (scripting.registerContentScripts) for kept mods' sites only, at
 * document_start: applies mod CSS, re-applies it on single-page-app navigations, and runs each
 * mod's health checks once per visit. JS is not handled here; it runs as a user script.
 */
export default defineContentScript({
  matches: [],
  registration: "runtime",
  runAt: "document_start",
  noScriptStartedPostMessage: true,
  async main() {
    useJitlessZod();
    const styles = createStyleManager();
    let library: Library = await getLibrary();
    let url = location.href;
    let visit = 0;

    const applyNow = () => styles.apply(modsForUrl(library, location.href));

    async function checkVisit() {
      const thisVisit = ++visit;
      await domReady();
      await waitForQuiet(QUIET_MS, SETTLE_MAX_MS);
      let active = modsForUrl(library, location.href);
      const anyFailing = () => active.some((mod) => failedSelectors(mod).length > 0);
      // Content can arrive late (lazy loading); give failing checks one more chance.
      if (anyFailing()) await waitForQuiet(QUIET_MS * 2, RECHECK_MAX_MS);
      if (thisVisit !== visit) return; // the user navigated again; that visit reports instead
      active = modsForUrl(library, location.href);
      const report: CheckReport = {
        type: "claymod:checks",
        results: active.map((mod) => ({ modId: mod.id, failedSelectors: failedSelectors(mod) })),
      };
      await browser.runtime.sendMessage(report).catch(() => {});
    }

    function onUrlMaybeChanged() {
      if (location.href === url) return;
      url = location.href;
      applyNow();
      void checkVisit();
    }

    applyNow();
    void checkVisit();

    // Single-page apps: URL changes without a page load.
    const navigation = (globalThis as { navigation?: EventTarget }).navigation;
    navigation?.addEventListener("currententrychange", onUrlMaybeChanged);
    window.addEventListener("popstate", onUrlMaybeChanged);
    window.addEventListener("hashchange", onUrlMaybeChanged);

    // Debounced: re-attach styles a framework removed, and catch URL changes we missed.
    let pending: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        onUrlMaybeChanged();
        if (styles.anyDetached()) applyNow();
      }, 250);
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Enable/disable, kill switch, edits, repairs and undo take effect without a reload.
    browser.storage.onChanged.addListener(async (changes, area) => {
      if (area !== "local") return;
      if (!(KEYS.mods in changes || KEYS.modState in changes || KEYS.pausedSites in changes))
        return;
      library = await getLibrary();
      applyNow();
    });
  },
});
