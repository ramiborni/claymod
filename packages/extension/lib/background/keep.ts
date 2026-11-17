import { createModFromDraft, validateModDraft } from "@claymod/core";
import { newModState } from "@/lib/mods/state";
import { originsForMatches } from "@/lib/origins";
import type { RpcHandlers } from "@/lib/rpc/server";
import { saveMod } from "@/lib/storage";
import { clearPreview } from "./preview";

/**
 * Saves a previewed draft as a mod. The side panel has already asked for host permission
 * (it needs the click's user gesture); we only check it was granted.
 */
export const keep: RpcHandlers["keep"] = async ({ tabId, generated, jsReviewed }) => {
  const draft = validateModDraft(generated.draft);
  if (!draft.ok) return { ok: false, error: "This mod is no longer valid. Generate it again." };
  const granted = await browser.permissions.contains({
    origins: originsForMatches(draft.value.matches),
  });
  if (!granted) {
    return {
      ok: false,
      error:
        "Claymod needs access to this site to apply the mod on your next visit. Click Keep again and choose Allow.",
    };
  }
  const now = new Date().toISOString();
  const mod = createModFromDraft(draft.value, {
    id: crypto.randomUUID(),
    now,
    createdBy: { provider: generated.provider, model: generated.model },
  });
  // JS runs on later visits only if the user saw it: it ran in the preview or they opened the code.
  await saveMod(mod, newModState(!mod.js?.trim() || jsReviewed));
  await clearPreview(tabId); // the page now shows the kept mod
  return { ok: true, value: { id: mod.id, name: mod.name } };
};
