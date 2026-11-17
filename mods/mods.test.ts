import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateMod } from "../packages/core/src/mod/index";

const dir = import.meta.dir;
const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

describe("starter mods", () => {
  test("there are at least ten", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    test(`${file} is a valid mod in format v1`, () => {
      const result = validateMod(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
      if (!result.ok) throw new Error(result.error.join("\n"));
      expect(result.value.version).toBe(1);
      expect(result.value.history).toEqual([]);
    });
  }

  test("ids are unique and file names are kebab-case slugs", () => {
    const ids = files.map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")).id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const file of files) expect(file).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.json$/);
  });

  test("every starter mod is exercised by the fixture tests", () => {
    const suite = readFileSync(
      path.join(dir, "../packages/extension/tests/e2e/starter-mods.e2e.ts"),
      "utf8",
    );
    for (const file of files) expect(suite).toContain(`"${file.replace(/\.json$/, "")}"`);
  });
});
