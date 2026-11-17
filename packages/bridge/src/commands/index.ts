import type { Command } from "../context";
import { doctor } from "./doctor";
import { host } from "./host";
import { install, uninstall } from "./install";
import { keys } from "./keys";

export const COMMANDS = ["install", "uninstall", "doctor", "keys", "host", "mcp"] as const;

export type CommandName = (typeof COMMANDS)[number];

export function isCommandName(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

const mcp: Command = async (_args, context) => {
  context.err('"mcp" is not implemented yet. It arrives in milestone M5 (see docs/roadmap.md).');
  return 1;
};

export const COMMAND_HANDLERS: Record<CommandName, Command> = {
  install,
  uninstall,
  doctor,
  keys,
  host,
  mcp,
};

export const COMMAND_SUMMARIES: Record<CommandName, string> = {
  install: "Register the bridge with Chrome for the Claymod extension",
  uninstall: "Remove the registration, settings and saved keys",
  doctor: "Check the setup and which agent CLIs can run",
  keys: "Save or delete agent API keys in the system keychain",
  host: "Native messaging host (Chrome starts it)",
  mcp: "MCP server for agents (milestone M5)",
};
