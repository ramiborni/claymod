import { delimiter, join } from "node:path";

/**
 * Chrome started from the Dock or a desktop launcher doesn't get the shell's PATH, so agents
 * installed in the usual per-user places would be missed. The PATH saved by `install` comes
 * first, then the current PATH, then these.
 */
export function commonBinDirs(
  home: string,
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): string[] {
  if (platform === "win32") {
    const appData = env.APPDATA ?? join(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [join(appData, "npm"), join(home, ".local", "bin"), join(local, "Programs")];
  }
  return [
    join(home, ".local", "bin"),
    join(home, ".claude", "local"),
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    join(home, ".antigravity", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
}

/** Joins PATH lists in order, dropping empty and repeated entries. */
export function searchPath(parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  for (const part of parts) {
    for (const dir of (part ?? "").split(delimiter)) {
      if (dir) seen.add(dir);
    }
  }
  return [...seen].join(delimiter);
}

export type Which = (command: string, path: string) => string | undefined;

export const bunWhich: Which = (command, path) => Bun.which(command, { PATH: path }) ?? undefined;
