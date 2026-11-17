export const COMMANDS = ["install", "uninstall", "host", "mcp", "doctor"] as const;

export type CommandName = (typeof COMMANDS)[number];

export function isCommandName(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}
