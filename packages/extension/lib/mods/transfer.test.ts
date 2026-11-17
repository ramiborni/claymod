import { describe, expect, test } from "bun:test";
import { makeMod } from "./fixtures";
import { exportBundle, parseImport } from "./transfer";

describe("export and import", () => {
  test("round-trips mods through an export bundle", () => {
    const mods = [makeMod()];
    const bundle = exportBundle(mods, "2026-11-17T10:00:00.000Z");
    expect(JSON.parse(bundle)).toMatchObject({ format: "claymod-mods", formatVersion: 1 });
    expect(parseImport(bundle)).toEqual({ mods, errors: [] });
  });

  test("accepts a single mod or an array", () => {
    expect(parseImport(JSON.stringify(makeMod())).mods).toHaveLength(1);
    expect(parseImport(JSON.stringify([makeMod(), makeMod()])).mods).toHaveLength(2);
  });

  test("keeps valid mods and explains rejected ones", () => {
    const text = JSON.stringify({ mods: [makeMod(), { ...makeMod(), matches: ["nope"] }] });
    const result = parseImport(text);
    expect(result.mods).toHaveLength(1);
    expect(result.errors).toEqual([
      "Mod 2: matches.0: Not a valid Chrome match pattern for http(s) pages",
    ]);
  });

  test("explains files that aren't mods", () => {
    expect(parseImport("{").errors[0]).toContain("isn't valid JSON");
    expect(parseImport('{"hello":1}').errors[0]).toBe("This file doesn't contain Claymod mods.");
  });
});
