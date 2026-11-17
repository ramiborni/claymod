import type { Mod } from "@claymod/core/mod";

/** Selectors of the mod's checks that match nothing on the page right now. */
export function failedSelectors(mod: Mod, root: ParentNode = document): string[] {
  return mod.checks
    .filter((check) => {
      try {
        return root.querySelector(check.selector) === null;
      } catch {
        return true; // an invalid selector can never pass
      }
    })
    .map((check) => check.selector);
}

/**
 * Resolves once the DOM has been quiet for `quietMs` (or after `maxMs`), so checks don't run
 * while a page or single-page app is still rendering.
 */
export function waitForQuiet(quietMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = setTimeout(done, quietMs);
    const deadline = setTimeout(done, maxMs);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    function done() {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(deadline);
      resolve();
    }
  });
}

export const domReady = (): Promise<void> =>
  document.readyState === "loading"
    ? new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
      )
    : Promise.resolve();
