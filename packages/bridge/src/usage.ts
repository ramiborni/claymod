import { COMMANDS } from "./commands";

export function usage(): string {
  return [
    "Usage: claymod-bridge <command>",
    "",
    "Commands:",
    ...COMMANDS.map((name) => `  ${name}`),
    "",
    "Run 'claymod-bridge <command> --help' for details.",
  ].join("\n");
}
