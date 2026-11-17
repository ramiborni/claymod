import type { Result } from "@claymod/core";
import type {
  AgentAuth,
  AgentId,
  BridgeError,
  GenerateResult,
} from "@claymod/core/bridge-protocol";

export interface RunPrompt {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export interface RunInput {
  prompt: RunPrompt;
  responseSchema?: Record<string, unknown> | undefined;
  model?: string | undefined;
  auth: AgentAuth;
  timeoutMs: number;
}

/** Where a run happens. Every run gets a fresh, empty temporary folder. */
export interface RunContext {
  /** Absolute path of the empty working directory. */
  workDir: string;
  /** Absolute path used as HOME in API-key mode, so the CLI never sees the user's sign-in. */
  homeDir: string;
  platform: NodeJS.Platform;
}

/** How to start the agent. Pure data, so runners are unit-tested without spawning anything. */
export interface Invocation {
  args: string[];
  stdin: string;
  /** Extra environment variables for this agent, on top of the base environment. */
  env: Record<string, string>;
  /** Files written before the run, keyed by path relative to the working directory. */
  files: Record<string, string>;
  /** A file the agent writes its answer to, relative to the working directory. */
  outputFile?: string;
}

export interface AgentOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Contents of Invocation.outputFile, when the agent wrote it. */
  outputFile?: string | undefined;
}

export interface AgentRunner {
  id: AgentId;
  /** Executable name looked up on PATH. */
  command: string;
  /** Environment variable that carries an API key in API-key mode. */
  keyEnv: string;
  /** Arguments of a quick, offline sign-in check, when the CLI documents one. */
  signInCheck?: string[];
  /** What to do when the CLI's own sign-in is missing. */
  signInHint: string;
  invocation(input: RunInput, context: RunContext): Invocation;
  parse(output: AgentOutput, input: RunInput): Result<GenerateResult, BridgeError>;
}

export type { AgentAuth };
