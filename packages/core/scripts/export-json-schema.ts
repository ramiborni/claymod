// Writes the mod JSON Schemas to packages/core/schema/. Run: bun run --cwd packages/core schema:export
import { modDraftJsonSchema, modJsonSchema } from "../src/mod/json-schema";

const outDir = new URL("../schema/", import.meta.url);
const files = {
  "mod.schema.json": modJsonSchema(),
  "mod-draft.schema.json": modDraftJsonSchema(),
};

for (const [name, schema] of Object.entries(files)) {
  await Bun.write(new URL(name, outDir), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote schema/${name}`);
}
