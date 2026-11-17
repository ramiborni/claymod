import { expect, test } from "bun:test";
import { Glob } from "bun";
import { validateMod } from "../src/mod/validate";

// Every starter mod in /mods must match the schema. CI runs this with the unit tests.
const modsDir = new URL("../../../mods/", import.meta.url).pathname;
const files = [...new Glob("*.json").scanSync(modsDir)];

test("mods/ directory is readable", () => {
  expect(Array.isArray(files)).toBe(true);
});

for (const file of files) {
  test(`mods/${file} is a valid mod`, async () => {
    const result = validateMod(await Bun.file(`${modsDir}${file}`).json());
    expect(result.ok ? [] : result.error).toEqual([]);
  });
}
