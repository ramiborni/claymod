import type { PageMessage, PageReply } from "@/lib/page/messages";
import type { RpcResult } from "@/lib/rpc/protocol";

const CONTENT_SCRIPT = "/content-scripts/content.js";

export const NO_ACCESS =
  "Claymod can't access this page yet. Click the Claymod icon in the toolbar while this page is open, then try again. (Browser pages like chrome:// and the Chrome Web Store can't be changed.)";

async function ping(tabId: number): Promise<boolean> {
  try {
    return (
      (await browser.tabs.sendMessage(tabId, { type: "claymod:ping" } satisfies PageMessage)) ===
      true
    );
  } catch {
    return false;
  }
}

/** Injects the content script once per page. Needs activeTab or a host permission. */
export async function ensureContentScript(tabId: number): Promise<RpcResult<null>> {
  if (await ping(tabId)) return { ok: true, value: null };
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: NO_ACCESS };
  }
}

export async function askPage<T extends PageMessage["type"]>(
  tabId: number,
  message: Extract<PageMessage, { type: T }>,
): Promise<RpcResult<PageReply<T>>> {
  const ready = await ensureContentScript(tabId);
  if (!ready.ok) return ready;
  try {
    return { ok: true, value: (await browser.tabs.sendMessage(tabId, message)) as PageReply<T> };
  } catch {
    return { ok: false, error: "The page changed while Claymod was working on it. Try again." };
  }
}
