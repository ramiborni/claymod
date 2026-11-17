import { buildCreatePrompt, generateModDraft, snapshotSchema } from "@claymod/core";
import type { RpcHandlers } from "@/lib/rpc/server";
import { askPage } from "./page-access";
import { configuredProvider, NOT_CONFIGURED, providerName } from "./provider";

/** Snapshot the page, ask the configured model for a mod, validate (with one retry). */
export const generate: RpcHandlers["generate"] = async (
  { tabId, request, pickedElement },
  signal,
) => {
  if (!request.trim()) return { ok: false, error: "Describe the change you want first." };
  const configured = await configuredProvider();
  if (!configured) return { ok: false, error: NOT_CONFIGURED };

  const page = await askPage(tabId, { type: "claymod:snapshot" });
  if (!page.ok) return page;
  const snapshot = snapshotSchema.safeParse({ ...page.value, pickedElement });
  if (!snapshot.success) {
    return { ok: false, error: "Claymod can only change regular web pages (http or https)." };
  }

  const prompt = buildCreatePrompt({ request, snapshot: snapshot.data });
  const result = await generateModDraft({ provider: configured.provider, prompt, signal });
  if (signal.aborted) return { ok: false, error: "Cancelled." };
  if (!result.ok) {
    const error = result.error;
    return { ok: false, error: error.kind === "provider" ? error.error.message : error.message };
  }
  return {
    ok: true,
    value: {
      draft: result.value.draft,
      provider: providerName(configured.config),
      model: result.value.model,
    },
  };
};
