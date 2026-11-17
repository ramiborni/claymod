import { type CreatedBy, MAX_HISTORY, type Mod, type ModDraft, type ModVersion } from "./schema";

export interface NewModContext {
  id: string;
  now: string;
  createdBy: CreatedBy;
}

/** Turns a validated model draft into a stored mod. */
export function createModFromDraft(draft: ModDraft, context: NewModContext): Mod {
  return {
    schemaVersion: 1,
    id: context.id,
    ...draft,
    version: 1,
    createdBy: context.createdBy,
    createdAt: context.now,
    updatedAt: context.now,
    history: [],
  };
}

function snapshotVersion(mod: Mod): ModVersion {
  const { schemaVersion: _schema, id: _id, createdAt: _created, history: _history, ...rest } = mod;
  return rest;
}

/** Saves a repaired or edited draft as the next version, keeping at most MAX_HISTORY old ones. */
export function nextModVersion(mod: Mod, draft: ModDraft, context: Omit<NewModContext, "id">): Mod {
  const history = [snapshotVersion(mod), ...mod.history].slice(0, MAX_HISTORY);
  return {
    ...mod,
    css: undefined,
    js: undefined,
    ...draft,
    version: mod.version + 1,
    createdBy: context.createdBy,
    updatedAt: context.now,
    history,
  };
}

/** Restores the most recent previous version (Undo). Returns undefined if there is none. */
export function previousModVersion(mod: Mod, now: string): Mod | undefined {
  const [previous, ...older] = mod.history;
  if (!previous) return undefined;
  return { ...mod, css: undefined, js: undefined, ...previous, updatedAt: now, history: older };
}
