import { contentScriptMatches, userScriptRegistrations } from "@/lib/mods/selection";
import { getLibrary } from "@/lib/storage";
import { userScriptsAvailable } from "@/lib/user-scripts";

export const APPLY_SCRIPT_ID = "claymod-apply";
const APPLY_SCRIPT_FILE = "/content-scripts/apply.js";
const MOD_SCRIPT_PREFIX = "mod-";

async function syncContentScript(matches: string[]): Promise<void> {
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [APPLY_SCRIPT_ID] });
  if (matches.length === 0) {
    if (existing.length)
      await browser.scripting.unregisterContentScripts({ ids: [APPLY_SCRIPT_ID] });
    return;
  }
  const script = {
    id: APPLY_SCRIPT_ID,
    matches,
    js: [APPLY_SCRIPT_FILE],
    runAt: "document_start" as const,
    allFrames: false,
    persistAcrossSessions: true,
  };
  if (existing.length) await browser.scripting.updateContentScripts([script]);
  else await browser.scripting.registerContentScripts([script]);
}

async function syncUserScripts(wanted: ReturnType<typeof userScriptRegistrations>): Promise<void> {
  if (!userScriptsAvailable()) return; // the side panel explains how to turn them on
  const current = await browser.userScripts.getScripts();
  const ours = current.filter((script) => script.id.startsWith(MOD_SCRIPT_PREFIX)).map((s) => s.id);
  if (ours.length) await browser.userScripts.unregister({ ids: ours });
  if (wanted.length) await browser.userScripts.register(wanted);
}

let lastSignature = "";
let running: Promise<void> = Promise.resolve();

/**
 * Makes Chrome's registrations match storage: one content script (CSS + checks) for every
 * enabled mod's sites, and one user script per enabled mod with reviewed JS. Skips the work when
 * nothing relevant changed (check results are written on every visit).
 */
export function syncRegistrations(force = false): Promise<void> {
  running = running.then(async () => {
    const library = await getLibrary();
    const matches = contentScriptMatches(library);
    const scripts = userScriptRegistrations(library);
    const signature = JSON.stringify({ matches, scripts, userScripts: userScriptsAvailable() });
    if (!force && signature === lastSignature) return;
    try {
      await syncContentScript(matches);
      await syncUserScripts(scripts);
      lastSignature = signature;
    } catch (error) {
      console.error("Claymod couldn't update its registered scripts", error);
    }
  });
  return running;
}
