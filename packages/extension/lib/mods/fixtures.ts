import type { Mod } from "@claymod/core/mod";
import type { Library } from "../storage";
import { newModState } from "./state";

/** Test data shared by unit tests. */
export function makeMod(overrides: Partial<Mod> = {}): Mod {
  return {
    schemaVersion: 1,
    id: "6f1c1f4e-3b8a-4f61-9a55-2f3c6d1e9b20",
    name: "Hide promoted posts",
    description: "Hides promoted posts.",
    matches: ["https://example.com/*"],
    css: ".promoted { display: none !important; }",
    runAt: "document_start",
    checks: [{ selector: ".post", expect: "exists" }],
    version: 1,
    createdBy: { provider: "openai-compatible", model: "m" },
    createdAt: "2026-11-17T10:00:00.000Z",
    updatedAt: "2026-11-17T10:00:00.000Z",
    history: [],
    ...overrides,
  };
}

export function makeLibrary(mods: Mod[], jsApproved = true): Library {
  return {
    mods: Object.fromEntries(mods.map((mod) => [mod.id, mod])),
    state: Object.fromEntries(mods.map((mod) => [mod.id, newModState(jsApproved)])),
    pausedSites: [],
  };
}
