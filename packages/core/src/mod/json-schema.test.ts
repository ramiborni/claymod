import { describe, expect, test } from "bun:test";
import { modDraftJsonSchema, modJsonSchema, toStrictOutputSchema } from "./json-schema";

const committed = (name: string) =>
  Bun.file(new URL(`../../schema/${name}`, import.meta.url)).json();

describe("JSON Schema export", () => {
  test("committed schema files are up to date (run `bun run schema:export` in packages/core)", async () => {
    expect(await committed("mod.schema.json")).toEqual(modJsonSchema());
    expect(await committed("mod-draft.schema.json")).toEqual(modDraftJsonSchema());
  });

  test("the draft schema only has the fields a model writes", () => {
    const schema = modDraftJsonSchema();
    expect(Object.keys(schema.properties as object).sort()).toEqual(
      ["checks", "css", "description", "js", "matches", "name", "runAt"].sort(),
    );
    expect(schema.additionalProperties).toBe(false);
  });

  test("toStrictOutputSchema strips keywords structured outputs reject", () => {
    const strict = JSON.stringify(toStrictOutputSchema(modDraftJsonSchema()));
    for (const keyword of ["$schema", "minLength", "maxLength", "pattern"]) {
      expect(strict).not.toContain(`"${keyword}"`);
    }
    expect(strict).toContain('"minItems":1');
    expect(strict).toContain('"additionalProperties":false');
  });

  test("toStrictOutputSchema drops minItems above 1", () => {
    expect(toStrictOutputSchema({ type: "array", minItems: 2 })).toEqual({ type: "array" });
  });
});
