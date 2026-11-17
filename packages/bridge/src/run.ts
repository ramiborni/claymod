import { isCommandName } from "./commands";
import { usage } from "./usage";

export interface RunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Pure dispatcher so the CLI can be tested without spawning a process. */
export function run(args: readonly string[]): RunOutput {
  const [command] = args;
  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: usage(), stderr: "" };
  }
  if (!isCommandName(command)) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Unknown command "${command}". Run 'claymod-bridge --help' to see the available commands.`,
    };
  }
  return {
    exitCode: 1,
    stdout: "",
    stderr: `"${command}" is not implemented yet. It arrives in milestone M4 (see docs/roadmap.md).`,
  };
}
