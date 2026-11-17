import {
  buildRepairPrompt,
  generateModDraft,
  nextModVersion,
  snapshotSchema,
  validateModDraft,
} from "@claymod/core";
import { originsForMatches } from "@/lib/origins";
import type { RpcHandlers } from "@/lib/rpc/server";
import { getLibrary, updateLibrary } from "@/lib/storage";
import { resetHealth } from "./edit";
import { askPage } from "./page-access";
import { clearPreview, preview } from "./preview";
import { configuredProvider, NOT_CONFIGURED, providerName } from "./provider";

/** Asks the model to fix a mod for the page as it is now, then previews the result. */
export const repair: RpcHandlers["repair"] = async ({ tabId, modId }, signal) => {
  const library = await getLibrary();
  const mod = library.mods[modId];
  if (!mod) return { ok: false, error: "This mod no longer exists." };
  const configured = await configuredProvider();
  if (!configured) return { ok: false, error: NOT_CONFIGURED };
  const page = await askPage(tabId, { type: "claymod:snapshot" });
  if (!page.ok) return page;
  const snapshot = snapshotSchema.safeParse(page.value);
  if (!snapshot.success)
    return { ok: false, error: "Open a page where this mod runs, then try Repair again." };

  const failedSelectors = library.state[modId]?.checkRuns.at(-1)?.failedSelectors ?? [];
  const prompt = buildRepairPrompt({ mod, snapshot: snapshot.data, failedSelectors });
  const result = await generateModDraft({ provider: configured.provider, prompt, signal });
  if (signal.aborted) return { ok: false, error: "Cancelled." };
  if (!result.ok) {
    return {
      ok: false,
      error: result.error.kind === "provider" ? result.error.error.message : result.error.message,
    };
  }
  const generated = {
    draft: result.value.draft,
    provider: providerName(configured.config),
    model: result.value.model,
  };
  const previewed = await preview({ tabId, draft: generated.draft }, signal);
  return previewed.ok ? { ok: true, value: { generated, preview: previewed.value } } : previewed;
};

/** Saves the repaired draft as the next version; the previous one stays in history (max 5). */
export const saveRepair: RpcHandlers["saveRepair"] = async ({
  tabId,
  modId,
  generated,
  jsReviewed,
}) => {
  const draft = validateModDraft(generated.draft);
  if (!draft.ok) return { ok: false, error: "This repair is no longer valid. Run Repair again." };
  if (!(await browser.permissions.contains({ origins: originsForMatches(draft.value.matches) }))) {
    return {
      ok: false,
      error: "Claymod needs access to this site. Click Save again and choose Allow.",
    };
  }
  const now = new Date().toISOString();
  const createdBy = { provider: generated.provider, model: generated.model };
  const saved = await updateLibrary((library) => {
    const mod = library.mods[modId];
    if (!mod) return undefined;
    const next = nextModVersion(mod, draft.value, { now, createdBy });
    library.mods[modId] = next;
    resetHealth(library, modId);
    const state = library.state[modId];
    if (state) state.jsApproved = !next.js?.trim() || jsReviewed;
    return next;
  });
  if (!saved) return { ok: false, error: "This mod no longer exists." };
  await clearPreview(tabId);
  return { ok: true, value: { name: saved.name, version: saved.version } };
};
