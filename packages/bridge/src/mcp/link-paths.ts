import { join } from "node:path";
import { configDir, type Machine } from "../paths";

/**
 * Where the native host listens for `claymod-bridge mcp`. On macOS and Linux a Unix socket in
 * Claymod's settings folder (mode 0700); on Windows a named pipe per user. Either way a random
 * token, readable only by the user, must accompany every call.
 */
export function linkPaths(machine: Machine): { socket: string; token: string; dir: string } {
  const dir = configDir(machine);
  const user = (machine.env.USERNAME ?? "user").replace(/[^A-Za-z0-9_.-]/g, "_");
  const socket =
    machine.platform === "win32" ? `\\\\.\\pipe\\claymod-bridge-${user}` : join(dir, "mcp.sock");
  return { socket, token: join(dir, "mcp-token"), dir };
}
