import { type Mod, validateMod } from "@claymod/core/mod";

export const EXPORT_FORMAT = "claymod-mods";

/** A shareable file: mods only, never local state like enabled or check results. */
export function exportBundle(mods: Mod[], exportedAt: string): string {
  return `${JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, exportedAt, mods }, null, 2)}\n`;
}

export interface ParsedImport {
  mods: Mod[];
  /** One line per rejected mod, e.g. "Mod 2: matches.0: Not a valid Chrome match pattern". */
  errors: string[];
}

function candidates(json: unknown): unknown[] | undefined {
  if (Array.isArray(json)) return json;
  if (typeof json !== "object" || json === null) return undefined;
  if ("mods" in json && Array.isArray(json.mods)) return json.mods;
  if ("schemaVersion" in json) return [json]; // a single mod
  return undefined;
}

/** Accepts an export bundle, an array of mods or a single mod. Each mod is validated. */
export function parseImport(text: string): ParsedImport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      mods: [],
      errors: ["This file isn't valid JSON. Choose a file exported from Claymod."],
    };
  }
  const items = candidates(json);
  if (!items) return { mods: [], errors: ["This file doesn't contain Claymod mods."] };
  const result: ParsedImport = { mods: [], errors: [] };
  items.forEach((item, index) => {
    const mod = validateMod(item);
    if (mod.ok) result.mods.push(mod.value);
    else result.errors.push(`Mod ${index + 1}: ${mod.error[0] ?? "invalid"}`);
  });
  return result;
}
