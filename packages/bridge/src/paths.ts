import { join } from "node:path";
import { BRIDGE_HOST_NAME } from "@claymod/core/bridge-protocol";
import type { Env } from "./env";

/**
 * Native messaging host locations, from
 * https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
 */
export const BROWSERS = ["chrome", "chromium", "chrome-for-testing"] as const;
export type Browser = (typeof BROWSERS)[number];

export const BROWSER_LABELS: Record<Browser, string> = {
  chrome: "Chrome",
  chromium: "Chromium",
  "chrome-for-testing": "Chrome for Testing",
};

/** The docs give no Windows registry key for Chrome for Testing, so it isn't offered there. */
export function browsersFor(platform: NodeJS.Platform): Browser[] {
  return platform === "win32" ? ["chrome", "chromium"] : [...BROWSERS];
}

const DATA_DIRS: Record<Browser, { darwin: string[]; linux: string; win32: string[] }> = {
  chrome: {
    darwin: ["Google", "Chrome"],
    linux: "google-chrome",
    win32: ["Google", "Chrome", "User Data"],
  },
  chromium: { darwin: ["Chromium"], linux: "chromium", win32: ["Chromium", "User Data"] },
  "chrome-for-testing": {
    darwin: ["Google", "ChromeForTesting"],
    linux: "google-chrome-for-testing",
    win32: ["Google", "Chrome for Testing", "User Data"],
  },
};

export interface Machine {
  platform: NodeJS.Platform;
  home: string;
  env: Env;
}

/** The browser's own data folder, used to tell which browsers are installed. */
export function browserDataDir(browser: Browser, { platform, home, env }: Machine): string {
  const dirs = DATA_DIRS[browser];
  if (platform === "darwin") return join(home, "Library", "Application Support", ...dirs.darwin);
  if (platform === "win32") {
    return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), ...dirs.win32);
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), dirs.linux);
}

/** Where the manifest goes. On Windows it lives in Claymod's folder and the registry points to it. */
export function manifestPath(browser: Browser, machine: Machine): string {
  if (machine.platform === "win32") {
    return join(configDir(machine), `${BRIDGE_HOST_NAME}.${browser}.json`);
  }
  return join(browserDataDir(browser, machine), "NativeMessagingHosts", `${BRIDGE_HOST_NAME}.json`);
}

export function registryKey(browser: Browser): string {
  const vendor = browser === "chromium" ? "Chromium" : "Google\\Chrome";
  return `HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${BRIDGE_HOST_NAME}`;
}

/** Claymod's own settings folder (bridge.json, the dev launcher, Windows manifests). */
export function configDir({ platform, home, env }: Machine): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claymod");
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claymod");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "claymod");
}
