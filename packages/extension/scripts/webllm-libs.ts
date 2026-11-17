/**
 * Puts the on-device models' WebAssembly libraries into public/webllm/ so they ship inside the
 * extension (CLAUDE.md: never fetch code at runtime). Each file is checked against the SRI hash
 * pinned in @claymod/core; a mismatch fails the build. Files already present and valid are kept.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ON_DEVICE_LIB_SOURCE, ON_DEVICE_MODELS } from "@claymod/core/on-device";

const outDir = path.resolve(import.meta.dir, "../public/webllm");

const sri = (data: Uint8Array) => `sha256-${createHash("sha256").update(data).digest("base64")}`;

async function existing(file: string, integrity: string): Promise<boolean> {
  try {
    return sri(await readFile(path.join(outDir, file))) === integrity;
  } catch {
    return false;
  }
}

await mkdir(outDir, { recursive: true });
const libs = new Map(ON_DEVICE_MODELS.map((model) => [model.lib.file, model.lib.integrity]));
for (const [file, integrity] of libs) {
  if (await existing(file, integrity)) continue;
  const response = await fetch(`${ON_DEVICE_LIB_SOURCE}${file}`);
  if (!response.ok) throw new Error(`Couldn't download ${file}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (sri(data) !== integrity) {
    throw new Error(`${file} doesn't match its pinned hash (${integrity}); refusing to ship it.`);
  }
  await writeFile(path.join(outDir, file), data);
  console.log(`✓ ${file} (${(data.byteLength / 1e6).toFixed(1)} MB)`);
}
