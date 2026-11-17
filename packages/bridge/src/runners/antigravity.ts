import { join } from "node:path";
import { err, ok } from "@claymod/core";
import { failure, parseJsonObject, runFailure } from "./errors";
import { fullPromptText } from "./prompt";
import type { AgentRunner } from "./types";

const SIGN_IN_HINT = "Run 'agy' once in a terminal and sign in, then try again.";
const SCHEMA = "schema.json";
/** agy exits with 3 when --print-timeout runs out. */
const TIMEOUT_EXIT_CODE = 3;

/**
 * Antigravity CLI in headless mode (`agy -p`), documented at
 * https://antigravity.google/docs/cli/headless/. Plain stdin isn't a documented prompt source,
 * so the prompt is an argument (the host refuses prompts too long for the OS). API-key mode runs
 * with an empty HOME holding only {"modelProvider":"gemini"}, so no cached Google sign-in is
 * used, and passes GEMINI_API_KEY.
 */
export const antigravity: AgentRunner = {
  id: "antigravity",
  command: "agy",
  keyEnv: "GEMINI_API_KEY",
  signInHint: SIGN_IN_HINT,

  invocation(input, context) {
    const files: Record<string, string> = {};
    if (input.responseSchema) files[SCHEMA] = JSON.stringify(input.responseSchema);
    if (input.auth === "api-key") {
      files["home/.gemini/antigravity-cli/settings.json"] = JSON.stringify({
        modelProvider: "gemini",
      });
    }
    const seconds = Math.max(1, Math.floor(input.timeoutMs / 1000) - 5);
    const args = [
      "-p",
      fullPromptText(input.prompt),
      "--output-format",
      "json",
      "--sandbox",
      "--print-timeout",
      `${seconds}s`,
      ...(input.responseSchema ? ["--json-schema", join(context.workDir, SCHEMA)] : []),
      ...(input.model ? ["--model", input.model] : []),
    ];
    return { args, stdin: "", env: {}, files };
  },

  parse(output, input) {
    if (output.exitCode === TIMEOUT_EXIT_CODE) {
      return err({
        kind: "timeout",
        message: "Antigravity CLI ran out of time. Try again, or ask for a smaller change.",
      });
    }
    const result = parseJsonObject(output.stdout);
    if (result?.status !== "SUCCESS" || output.exitCode !== 0) {
      const detail =
        (typeof result?.error === "string" ? result.error : "") || output.stderr || output.stdout;
      return err(runFailure("antigravity", input.auth, SIGN_IN_HINT, detail, output.exitCode));
    }
    const answer =
      result.structured_output !== undefined
        ? JSON.stringify(result.structured_output)
        : typeof result.response === "string"
          ? result.response
          : "";
    if (!answer) return err(failure("antigravity", "it returned an empty answer"));
    return ok({ text: answer, model: input.model ?? "antigravity" });
  },
};
