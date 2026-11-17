import type { RpcHandlers } from "@/lib/rpc/server";
import { userScriptsAvailable, userScriptsHelp } from "@/lib/user-scripts";
import { NO_ACCESS } from "./page-access";

interface PreviewState {
  css?: string | undefined;
  jsRan: boolean;
}

// Session storage survives service worker restarts but not browser restarts, like previews.
const key = (tabId: number) => `preview:${tabId}`;

async function getState(tabId: number): Promise<PreviewState | undefined> {
  return (await browser.storage.session.get(key(tabId)))[key(tabId)] as PreviewState | undefined;
}

async function revert(tabId: number, state: PreviewState): Promise<void> {
  if (state.jsRan) {
    await browser.tabs.reload(tabId); // JS changes can't be undone reliably
  } else if (state.css) {
    await browser.scripting.removeCSS({ target: { tabId }, css: state.css }).catch(() => {});
  }
}

export async function clearPreview(tabId: number): Promise<void> {
  await browser.storage.session.remove(key(tabId));
}

/** Applies a draft to this tab only. CSS via scripting; JS only in the USER_SCRIPT world. */
export const preview: RpcHandlers["preview"] = async ({ tabId, draft }) => {
  const previous = await getState(tabId);
  if (previous?.css) {
    await browser.scripting.removeCSS({ target: { tabId }, css: previous.css }).catch(() => {});
  }
  const state: PreviewState = {
    css: draft.css?.trim() || undefined,
    jsRan: previous?.jsRan ?? false,
  };
  try {
    if (state.css) await browser.scripting.insertCSS({ target: { tabId }, css: state.css });
  } catch {
    return { ok: false, error: NO_ACCESS };
  }
  let js: "none" | "ran" | "unavailable" = "none";
  if (draft.js?.trim()) {
    if (userScriptsAvailable()) {
      await browser.userScripts.execute({
        target: { tabId },
        js: [{ code: draft.js }],
        world: "USER_SCRIPT",
      });
      state.jsRan = true;
      js = "ran";
    } else {
      js = "unavailable";
    }
  }
  await browser.storage.session.set({ [key(tabId)]: state });
  const jsHelp = js === "unavailable" ? userScriptsHelp(browser.runtime.id) : undefined;
  return { ok: true, value: { css: Boolean(state.css), js, jsHelp } };
};

/** Fully reverts the preview: removes CSS, or reloads the page if JS ran. */
export const discard: RpcHandlers["discard"] = async ({ tabId }) => {
  const state = await getState(tabId);
  if (state) await revert(tabId, state);
  await clearPreview(tabId);
  return { ok: true, value: null };
};
