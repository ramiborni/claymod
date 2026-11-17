/**
 * Builds single-file claymod-bridge binaries with `bun build --compile`.
 *   bun scripts/compile.ts            this machine only
 *   bun scripts/compile.ts --all      macOS arm64/x64, Linux x64, Windows x64
 * Cross-compiling downloads the Bun runtime for each target once.
 */
import { join } from "node:path";

const TARGETS = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-x64": "bun-linux-x64",
  "windows-x64": "bun-windows-x64",
} as const;

const root = join(import.meta.dir, "..");
const all = process.argv.includes("--all");
const host = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const names = all ? Object.keys(TARGETS) : [host];

for (const name of names) {
  const target = TARGETS[name as keyof typeof TARGETS];
  if (!target) {
    console.error(`No release target for ${name}. Use --all to build the supported ones.`);
    process.exit(1);
  }
  const outfile = join(root, "dist", all ? `claymod-bridge-${name}` : "claymod-bridge");
  const result = Bun.spawnSync(
    [
      "bun",
      "build",
      join(root, "src/cli.ts"),
      "--compile",
      "--minify",
      `--target=${target}`,
      "--outfile",
      outfile,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
  console.log(`✓ ${name}: ${outfile}${name.startsWith("windows") ? ".exe" : ""}`);
}
