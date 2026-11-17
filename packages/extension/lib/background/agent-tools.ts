import {
  type AgentCall,
  type AgentResult,
  agentToolArgs,
  hostOfMatchPattern,
  matchesUrl,
  renderSnapshot,
  snapshotSchema,
  validateModDraft,
} from "@claymod/core";
import { getLibrary } from "@/lib/storage";
import { askUser } from "./agent-requests";
import { askPage } from "./page-access";

const fail = (error: string): AgentResult => ({ ok: false, error });
const done = (value: unknown): AgentResult => ({ ok: true, value });

const NO_PAGE =
  "Claymod can't read the active tab. Ask the user to open the page they want to change and click the Claymod icon in Chrome's toolbar on it, then try again.";
const NO_ANSWER =
  "The user didn't answer in time. Ask them to open Claymod's side panel (the Claymod icon in Chrome's toolbar) and try again.";

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

async function getActivePage(): Promise<AgentResult> {
  const tabId = await activeTabId();
  if (tabId === undefined) return fail(NO_PAGE);
  const page = await askPage(tabId, { type: "claymod:snapshot" });
  if (!page.ok) return fail(NO_PAGE);
  const snapshot = snapshotSchema.safeParse(page.value);
  if (!snapshot.success)
    return fail("The active tab isn't a web page Claymod can change (http or https).");
  const { url, title } = snapshot.data;
  return done({ tabId, url, title, page: renderSnapshot(snapshot.data) });
}

const runsOn = (matches: string[], site: string) =>
  matches.some(
    (pattern) =>
      hostOfMatchPattern(pattern) === site ||
      matchesUrl(pattern, `https://${site}/`) ||
      matchesUrl(pattern, `http://${site}/`),
  );

async function listMods(site?: string): Promise<AgentResult> {
  const { mods, state } = await getLibrary();
  const listed = Object.values(mods)
    .filter((mod) => !site || runsOn(mod.matches, site))
    .map((mod) => ({
      id: mod.id,
      name: mod.name,
      description: mod.description,
      matches: mod.matches,
      version: mod.version,
      enabled: state[mod.id]?.enabled ?? false,
      health: state[mod.id]?.health ?? "healthy",
    }));
  return done({ mods: listed });
}

async function modStatus(id: string): Promise<AgentResult> {
  const { mods, state } = await getLibrary();
  const mod = mods[id];
  if (!mod) return fail(`There is no mod with id "${id}". Call list_mods to see the ids.`);
  const local = state[id];
  const lastRun = local?.checkRuns.at(-1);
  const { history: _history, ...current } = mod;
  return done({
    ...current,
    enabled: local?.enabled ?? false,
    jsApproved: local?.jsApproved ?? false,
    health: local?.health ?? "healthy",
    lastCheck: lastRun ? { at: lastRun.at, failedSelectors: lastRun.failedSelectors } : null,
  });
}

/** preview_mod and save_mod: validate, then wait for the user in the side panel. */
async function proposeMod(
  call: AgentCall,
  mod: unknown,
  replacesId?: string,
): Promise<AgentResult> {
  const draft = validateModDraft(mod);
  if (!draft.ok) {
    return fail(
      `The mod isn't valid, fix it and call ${call.tool} again:\n- ${draft.error.join("\n- ")}`,
    );
  }
  let replaces: { id: string; name: string } | undefined;
  if (replacesId) {
    const existing = (await getLibrary()).mods[replacesId];
    if (!existing)
      return fail(`There is no mod with id "${replacesId}" to replace. Call list_mods.`);
    replaces = { id: existing.id, name: existing.name };
  }
  const tabId = await activeTabId();
  if (tabId === undefined) return fail(NO_PAGE);
  const tool = call.tool === "save_mod" ? "save_mod" : "preview_mod";
  const outcome = await askUser({ tool, client: call.client, draft: draft.value, tabId, replaces });
  if (outcome === "timeout") return fail(NO_ANSWER);
  if (outcome.kind === "saved")
    return done({ status: "saved", id: outcome.id, name: outcome.name, version: outcome.version });
  if (outcome.kind === "previewed") {
    return done({
      status: "previewed",
      tabId,
      next: "The user is looking at the preview. Call save_mod with this mod to keep it, or change it and preview again.",
    });
  }
  return done({ status: outcome.kind });
}

/** Runs one agent tool call. Arguments are untrusted: validated here, mods by the mod schema. */
export async function handleAgentCall(call: AgentCall): Promise<AgentResult> {
  const schema = agentToolArgs[call.tool];
  const args = schema.safeParse(call.args);
  if (!args.success) return fail(`Invalid arguments for ${call.tool}: ${args.error.message}`);
  const value = args.data as Record<string, unknown>;
  switch (call.tool) {
    case "get_active_page":
      return getActivePage();
    case "list_mods":
      return listMods(value.site as string | undefined);
    case "get_mod_status":
      return modStatus(value.id as string);
    case "preview_mod":
      return proposeMod(call, value.mod);
    case "save_mod":
      return proposeMod(call, value.mod, value.replaces as string | undefined);
  }
}
