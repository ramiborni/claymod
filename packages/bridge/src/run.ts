import { COMMAND_HANDLERS, isCommandName } from "./commands";
import type { CommandContext } from "./context";
import { usage } from "./usage";

/** Dispatches a command; Chrome starts the host with the extension's origin as first argument. */
export async function run(args: readonly string[], context: CommandContext): Promise<number> {
  const [command, ...rest] = args;
  if (command === undefined || command === "--help" || command === "-h") {
    context.out(usage());
    return 0;
  }
  if (command === "--version" || command === "-v") {
    context.out(context.version);
    return 0;
  }
  if (command.startsWith("chrome-extension://")) return COMMAND_HANDLERS.host([...args], context);
  if (!isCommandName(command)) {
    context.err(
      `Unknown command "${command}". Run 'claymod-bridge --help' to see the available commands.`,
    );
    return 2;
  }
  return COMMAND_HANDLERS[command](rest, context);
}
