import { type Mod, validateMod } from "@claymod/core/mod";
import { type ProviderConfig, providerConfigSchema } from "@claymod/core/provider-config";
import * as z from "zod";
import { type ModState, modStateSchema, newModState, pausedSitesSchema } from "./mods/state";
import { seal, sealedSchema, unseal } from "./secret-box";

export const KEYS = {
  provider: "providerConfig",
  mods: "mods",
  modState: "modState",
  pausedSites: "pausedSites",
  agentAccess: "agentAccess",
} as const;

/** M5: whether agents may use Claymod through `claymod-bridge mcp`. Off by default. */
export async function getAgentAccess(): Promise<boolean> {
  return (await browser.storage.local.get(KEYS.agentAccess))[KEYS.agentAccess] === true;
}

export async function setAgentAccess(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [KEYS.agentAccess]: enabled });
}

/** Provider settings at rest: the API key is encrypted (see secret-box.ts), the rest is plain. */
const storedProviderSchema = z.object({
  v: z.literal(2),
  config: z.record(z.string(), z.unknown()),
  apiKey: sealedSchema.optional(),
});

export async function getProviderConfig(): Promise<ProviderConfig | undefined> {
  const raw = (await browser.storage.local.get(KEYS.provider))[KEYS.provider];
  const stored = storedProviderSchema.safeParse(raw);
  if (stored.success) {
    const apiKey = stored.data.apiKey && (await unseal(stored.data.apiKey));
    const parsed = providerConfigSchema.safeParse({
      ...stored.data.config,
      ...(apiKey ? { apiKey } : {}),
    });
    return parsed.success ? parsed.data : undefined;
  }
  // Settings saved before keys were encrypted: encrypt them now.
  const legacy = providerConfigSchema.safeParse(raw);
  if (!legacy.success) return undefined;
  await setProviderConfig(legacy.data);
  return legacy.data;
}

export async function setProviderConfig(config: ProviderConfig): Promise<void> {
  const { apiKey, ...rest } = { apiKey: undefined, ...providerConfigSchema.parse(config) };
  await browser.storage.local.set({
    [KEYS.provider]: { v: 2, config: rest, ...(apiKey ? { apiKey: await seal(apiKey) } : {}) },
  });
}

export interface Library {
  mods: Record<string, Mod>;
  state: Record<string, ModState>;
  pausedSites: string[];
}

/** Everything about mods in one read. Invalid entries are skipped rather than breaking all mods. */
export async function getLibrary(): Promise<Library> {
  const stored = await browser.storage.local.get([KEYS.mods, KEYS.modState, KEYS.pausedSites]);
  const rawMods = (stored[KEYS.mods] ?? {}) as Record<string, unknown>;
  const rawState = (stored[KEYS.modState] ?? {}) as Record<string, unknown>;
  const mods: Record<string, Mod> = {};
  const state: Record<string, ModState> = {};
  for (const [id, value] of Object.entries(rawMods)) {
    const mod = validateMod(value);
    if (!mod.ok) continue;
    mods[id] = mod.value;
    const parsed = modStateSchema.safeParse(rawState[id]);
    state[id] = parsed.success ? parsed.data : newModState(false);
  }
  const paused = pausedSitesSchema.safeParse(stored[KEYS.pausedSites]);
  return { mods, state, pausedSites: paused.success ? paused.data : [] };
}

// JSON round-trip drops undefined fields so stored mods are plain JSON.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export async function saveLibrary(library: Library): Promise<void> {
  await browser.storage.local.set({
    [KEYS.mods]: plain(library.mods),
    [KEYS.modState]: plain(library.state),
    [KEYS.pausedSites]: library.pausedSites,
  });
}

/** Read-modify-write. Calls are serialised so concurrent updates don't overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();
export function updateLibrary<T>(change: (library: Library) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const library = await getLibrary();
    const result = await change(library);
    await saveLibrary(library);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export async function saveMod(mod: Mod, state: ModState): Promise<void> {
  await updateLibrary((library) => {
    library.mods[mod.id] = mod;
    library.state[mod.id] = state;
  });
}
