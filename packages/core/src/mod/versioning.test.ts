import { describe, expect, test } from "bun:test";
import { draft, LATER, mod, NOW } from "../../tests/fixtures";
import { validateMod } from "./validate";
import { createModFromDraft, nextModVersion, previousModVersion } from "./versioning";

const createdBy = { provider: "anthropic", model: "claude-opus-5-5" };

describe("versioning", () => {
  test("createModFromDraft builds a valid version-1 mod", () => {
    const created = createModFromDraft(draft, { id: mod.id, now: NOW, createdBy });
    expect(created.version).toBe(1);
    expect(created.history).toEqual([]);
    expect(validateMod(created).ok).toBe(true);
  });

  test("nextModVersion keeps the old version and replaces code fully", () => {
    const repaired = nextModVersion(
      mod,
      { ...draft, css: undefined, js: "console.log(1)" },
      { now: LATER, createdBy },
    );
    expect(repaired.version).toBe(2);
    expect(repaired.css).toBeUndefined();
    expect(repaired.js).toBe("console.log(1)");
    expect(repaired.createdAt).toBe(NOW);
    expect(repaired.updatedAt).toBe(LATER);
    expect(repaired.history[0]?.version).toBe(1);
    expect(repaired.history[0]?.css).toBe(mod.css);
    expect(validateMod(JSON.parse(JSON.stringify(repaired))).ok).toBe(true);
  });

  test("history is capped at 5, dropping the oldest", () => {
    let current = mod;
    for (let i = 0; i < 7; i++) current = nextModVersion(current, draft, { now: LATER, createdBy });
    expect(current.version).toBe(8);
    expect(current.history.map((entry) => entry.version)).toEqual([7, 6, 5, 4, 3]);
  });

  test("previousModVersion undoes the last change", () => {
    const repaired = nextModVersion(mod, { ...draft, name: "Renamed" }, { now: LATER, createdBy });
    const undone = previousModVersion(repaired, LATER);
    expect(undone?.name).toBe(mod.name);
    expect(undone?.version).toBe(1);
    expect(undone?.history).toEqual([]);
    expect(previousModVersion(mod, LATER)).toBeUndefined();
  });
});
