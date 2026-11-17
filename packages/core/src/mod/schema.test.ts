import { describe, expect, test } from "bun:test";
import { draft, mod } from "../../tests/fixtures";
import { validateMod, validateModDraft } from "./validate";

describe("mod schema v1", () => {
  test("accepts a complete mod", () => {
    expect(validateMod(mod)).toEqual({ ok: true, value: mod });
  });

  test("accepts a JS-only draft", () => {
    const { css: _css, ...rest } = draft;
    expect(validateModDraft({ ...rest, js: "document.title = 'x';" }).ok).toBe(true);
  });

  test("requires css or js", () => {
    const result = validateModDraft({ ...draft, css: "  " });
    expect(result).toEqual({ ok: false, error: ["css: A mod needs css or js (or both)"] });
  });

  test("reports invalid match patterns with their path", () => {
    const result = validateModDraft({ ...draft, matches: ["example.com"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error[0]).toStartWith("matches.0:");
  });

  test("requires at least one match and one check", () => {
    const result = validateModDraft({ ...draft, matches: [], checks: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((e) => e.split(":")[0])).toEqual(["matches", "checks"]);
  });

  test("rejects unknown fields so model output can't smuggle extra data", () => {
    expect(validateModDraft({ ...draft, permissions: ["<all_urls>"] }).ok).toBe(false);
  });

  test("rejects a bad id, schemaVersion or timestamp", () => {
    expect(validateMod({ ...mod, id: "not-a-uuid" }).ok).toBe(false);
    expect(validateMod({ ...mod, schemaVersion: 2 }).ok).toBe(false);
    expect(validateMod({ ...mod, createdAt: "yesterday" }).ok).toBe(false);
  });

  test("keeps at most 5 history entries", () => {
    const entry = {
      ...draft,
      version: 1,
      createdBy: mod.createdBy,
      updatedAt: mod.updatedAt,
    };
    expect(validateMod({ ...mod, history: Array(5).fill(entry) }).ok).toBe(true);
    expect(validateMod({ ...mod, history: Array(6).fill(entry) }).ok).toBe(false);
  });
});
