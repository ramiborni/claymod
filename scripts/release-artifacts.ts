/**
 * Builds every release artifact into dist/release (the workflow calls this too, so a local run
 * is a real dry run):
 *   claymod-extension-<version>-chrome.zip     the extension, ready for the Chrome Web Store
 *   claymod-bridge-<version>-<os>-<arch>[.exe]  claymod-bridge for macOS arm64/x64, Linux x64, Windows x64
 *   SHA256SUMS                                  checksums of the files above
 * and dist/release-notes.md from the extension's changelog.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const out = path.join(root, "dist/release");
const version: string = JSON.parse(
  readFileSync(path.join(root, "packages/extension/package.json"), "utf8"),
).version;

function run(command: string[], cwd = root) {
  console.log(`$ ${command.join(" ")}`);
  const result = Bun.spawnSync(command, { cwd, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed (${result.exitCode})`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The extension zip (wxt zip also fetches and verifies the on-device model libraries).
const outputDir = path.join(root, "packages/extension/.output");
rmSync(outputDir, { recursive: true, force: true });
run(["bun", "run", "zip"], path.join(root, "packages/extension"));
const zip = readdirSync(outputDir).find((file) => file.endsWith("-chrome.zip"));
if (!zip) throw new Error("wxt zip produced no *-chrome.zip");
copyFileSync(path.join(outputDir, zip), path.join(out, `claymod-extension-${version}-chrome.zip`));

// claymod-bridge for every target.
run(["bun", "run", "compile:all"], path.join(root, "packages/bridge"));
for (const target of ["darwin-arm64", "darwin-x64", "linux-x64", "windows-x64"]) {
  const ext = target.startsWith("windows") ? ".exe" : "";
  copyFileSync(
    path.join(root, `packages/bridge/dist/claymod-bridge-${target}${ext}`),
    path.join(out, `claymod-bridge-${version}-${target}${ext}`),
  );
}

const files = readdirSync(out).sort();
const sums = files.map((file) => {
  const hash = createHash("sha256")
    .update(readFileSync(path.join(out, file)))
    .digest("hex");
  return `${hash}  ${file}`;
});
writeFileSync(path.join(out, "SHA256SUMS"), `${sums.join("\n")}\n`);

// Release notes: this version's section of the extension changelog (Changesets writes it).
let notes = `Claymod ${version}`;
try {
  const changelog = readFileSync(path.join(root, "packages/extension/CHANGELOG.md"), "utf8");
  const section = changelog.split(/^## /m).find((part) => part.startsWith(`${version}\n`));
  if (section) notes = section.slice(version.length).trim();
} catch {
  // No changelog yet (first release before any version PR).
}
writeFileSync(
  path.join(root, "dist/release-notes.md"),
  `${notes}\n\nInstall: see https://github.com/ramiborni/claymod#install. Verify downloads with \`sha256sum -c SHA256SUMS\` and \`gh attestation verify <file> --repo ramiborni/claymod\`.\n`,
);

for (const file of [...files, "SHA256SUMS"]) {
  console.log(`✓ ${file} (${(statSync(path.join(out, file)).size / 1e6).toFixed(1)} MB)`);
}
