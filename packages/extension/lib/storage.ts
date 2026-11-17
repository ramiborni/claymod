import { type Mod, validateMod } from "@claymod/core/mod";
import { type ProviderConfig, providerConfigSchema } from "@claymod/core/provider-config";

const PROVIDER_KEY = "providerConfig";
const MODS_KEY = "mods";

export async function getProviderConfig(): Promise<ProviderConfig | undefined> {
  const stored = await browser.storage.local.get(PROVIDER_KEY);
  const parsed = providerConfigSchema.safeParse(stored[PROVIDER_KEY]);
  return parsed.success ? parsed.data : undefined;
}

export async function setProviderConfig(config: ProviderConfig): Promise<void> {
  await browser.storage.local.set({ [PROVIDER_KEY]: providerConfigSchema.parse(config) });
}

/** Mods keyed by id. Invalid entries are skipped rather than breaking every mod. */
export async function getMods(): Promise<Record<string, Mod>> {
  const stored = await browser.storage.local.get(MODS_KEY);
  const raw = (stored[MODS_KEY] ?? {}) as Record<string, unknown>;
  const mods: Record<string, Mod> = {};
  for (const [id, value] of Object.entries(raw)) {
    const result = validateMod(value);
    if (result.ok) mods[id] = result.value;
  }
  return mods;
}

export async function saveMod(mod: Mod): Promise<void> {
  const mods = await getMods();
  // JSON round-trip drops undefined fields so stored mods are plain JSON.
  mods[mod.id] = JSON.parse(JSON.stringify(mod));
  await browser.storage.local.set({ [MODS_KEY]: mods });
}
