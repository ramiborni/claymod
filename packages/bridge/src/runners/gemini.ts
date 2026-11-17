import { err, ok } from "@claymod/core";
import { failure, firstKey, parseJsonObject, runFailure } from "./errors";
import { fullPromptText } from "./prompt";
import type { AgentRunner } from "./types";

const SIGN_IN_HINT = "Run 'gemini' once in a terminal and sign in, then try again.";
const FINAL_INSTRUCTION = "Answer with the JSON object only, as the instructions above describe.";

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    return String((value as { message: unknown }).message);
  }
  return value === undefined ? "" : JSON.stringify(value);
}

/**
 * Gemini CLI in headless mode, documented at https://geminicli.com/docs/cli/headless/.
 * The prompt goes on stdin and -p appends the final instruction. It has no schema flag, so
 * Claymod's own validation (and one retry) does all the checking. API-key mode runs with an
 * empty HOME so no cached Google sign-in is used, and passes GEMINI_API_KEY.
 */
export const gemini: AgentRunner = {
  id: "gemini",
  command: "gemini",
  keyEnv: "GEMINI_API_KEY",
  signInHint: SIGN_IN_HINT,

  invocation(input) {
    const args = [
      "-p",
      FINAL_INSTRUCTION,
      "--output-format",
      "json",
      "--approval-mode",
      "default",
      ...(input.model ? ["--model", input.model] : []),
    ];
    return { args, stdin: fullPromptText(input.prompt), env: {}, files: {} };
  },

  parse(output, input) {
    const result = parseJsonObject(output.stdout);
    const problem = result ? errorText(result.error) : "";
    if (!result || problem || output.exitCode !== 0) {
      const detail = problem || output.stderr || output.stdout;
      return err(runFailure("gemini", input.auth, SIGN_IN_HINT, detail, output.exitCode));
    }
    const answer = typeof result.response === "string" ? result.response : "";
    if (!answer) return err(failure("gemini", "it returned an empty answer"));
    const stats = result.stats as { models?: unknown } | undefined;
    return ok({ text: answer, model: firstKey(stats?.models) ?? input.model ?? "gemini" });
  },
};
