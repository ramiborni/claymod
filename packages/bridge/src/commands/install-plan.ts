import { basename, join } from "node:path";
import { BRIDGE_HOST_NAME } from "@claymod/core/bridge-protocol";
import { type Browser, configDir, type Machine, manifestPath, registryKey } from "../paths";

export const EXTENSION_ID = /^[a-p]{32}$/;

export interface InstallFile {
  path: string;
  content: string;
  mode: number;
}

export interface InstallPlan {
  hostPath: string;
  files: InstallFile[];
  /** Windows only: registry keys whose default value points at a manifest. */
  registry: { key: string; manifest: string }[];
}

export interface SelfLocation {
  execPath: string;
  mainScript: string;
}

const isBun = (path: string) => /^bun(\.exe)?$/i.test(basename(path));

const shQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Chrome starts `path` with no arguments of our choosing. A compiled binary is started directly;
 * from source (bun src/cli.ts) a small launcher script runs bun with the entry script.
 */
function launcher(self: SelfLocation, machine: Machine): InstallFile | undefined {
  if (!isBun(self.execPath)) return undefined;
  const dir = configDir(machine);
  if (machine.platform === "win32") {
    return {
      path: join(dir, "claymod-bridge-host.cmd"),
      content: `@echo off\r\n"${self.execPath}" "${self.mainScript}" %*\r\n`,
      mode: 0o644,
    };
  }
  return {
    path: join(dir, "claymod-bridge-host"),
    content: `#!/bin/sh\nexec ${shQuote(self.execPath)} ${shQuote(self.mainScript)} "$@"\n`,
    mode: 0o755,
  };
}

/** Pure: the files and registry entries `install` writes, so it is tested without touching disk. */
export function planInstall(options: {
  machine: Machine;
  self: SelfLocation;
  browsers: Browser[];
  extensionIds: string[];
}): InstallPlan {
  const script = launcher(options.self, options.machine);
  const hostPath = script?.path ?? options.self.execPath;
  const manifest = {
    name: BRIDGE_HOST_NAME,
    description: "Claymod bridge: runs local AI agents for the Claymod extension",
    path: hostPath,
    type: "stdio",
    allowed_origins: options.extensionIds.map((id) => `chrome-extension://${id}/`),
  };
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const files = options.browsers.map((browser) => ({
    path: manifestPath(browser, options.machine),
    content,
    mode: 0o644,
  }));
  const registry =
    options.machine.platform === "win32"
      ? options.browsers.map((browser) => ({
          key: registryKey(browser),
          manifest: manifestPath(browser, options.machine),
        }))
      : [];
  return { hostPath, files: script ? [script, ...files] : files, registry };
}
