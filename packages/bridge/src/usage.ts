import { COMMAND_SUMMARIES, COMMANDS } from "./commands";

export function usage(): string {
  const width = Math.max(...COMMANDS.map((name) => name.length));
  return [
    "Usage: claymod-bridge <command>",
    "",
    "Commands:",
    ...COMMANDS.map((name) => `  ${name.padEnd(width)}  ${COMMAND_SUMMARIES[name]}`),
    "",
    "Run 'claymod-bridge <command> --help' for details.",
  ].join("\n");
}
