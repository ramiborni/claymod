import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as z from "zod";
import { BROWSERS } from "./paths";

/** What `install` remembers, so `host`, `doctor` and `uninstall` see the same setup. */
export const bridgeConfigSchema = z.object({
  extensionIds: z.array(z.string()),
  browsers: z.array(z.enum(BROWSERS)),
  /** The PATH of the terminal `install` ran in; Chrome's own PATH often lacks per-user tools. */
  path: z.string().optional(),
  /** Absolute path Chrome starts (the binary, or a launcher script in development). */
  hostPath: z.string(),
});
export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;

export const configFile = (dir: string) => join(dir, "bridge.json");

export async function readConfig(dir: string): Promise<BridgeConfig | undefined> {
  try {
    const parsed = bridgeConfigSchema.safeParse(
      JSON.parse(await readFile(configFile(dir), "utf8")),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function writeConfig(dir: string, config: BridgeConfig): Promise<void> {
  const file = configFile(dir);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
