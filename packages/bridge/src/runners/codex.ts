import { join } from "node:path";
import { err, ok } from "@claymod/core";
import { failure, runFailure } from "./errors";
import { fullPromptText } from "./prompt";
import { stripNulls, toStrictSchema } from "./strict-schema";
import type { AgentRunner } from "./types";

const SIGN_IN_HINT = "Run 'codex login' in a terminal, then try again.";
const OUTPUT = "answer.txt";
const SCHEMA = "schema.json";

/**
 * Codex in non-interactive mode (`codex exec`), documented at
 * https://learn.chatgpt.com/docs/non-interactive-mode. Read-only sandbox in an empty folder,
 * nothing saved. API-key mode points CODEX_HOME at an empty folder so a saved login is never
 * used, and passes the key in CODEX_API_KEY.
 */
export const codex: AgentRunner = {
  id: "codex",
  command: "codex",
  keyEnv: "CODEX_API_KEY",
  signInCheck: ["login", "status"],
  signInHint: SIGN_IN_HINT,

  invocation(input, context) {
    const files: Record<string, string> = {};
    if (input.responseSchema) {
      files[SCHEMA] = JSON.stringify(toStrictSchema(input.responseSchema));
    }
    const env: Record<string, string> = {};
    if (input.auth === "api-key") {
      env.CODEX_HOME = join(context.homeDir, ".codex");
      files["home/.codex/config.toml"] = "";
    }
    const args = [
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      context.workDir,
      "--output-last-message",
      join(context.workDir, OUTPUT),
      ...(input.responseSchema ? ["--output-schema", join(context.workDir, SCHEMA)] : []),
      ...(input.model ? ["--model", input.model] : []),
      "-",
    ];
    return { args, stdin: fullPromptText(input.prompt), env, files, outputFile: OUTPUT };
  },

  parse(output, input) {
    if (output.exitCode !== 0) {
      return err(
        runFailure(
          "codex",
          input.auth,
          SIGN_IN_HINT,
          output.stderr || output.stdout,
          output.exitCode,
        ),
      );
    }
    const answer = output.outputFile?.trim();
    if (!answer) return err(failure("codex", output.stderr || "it returned an empty answer"));
    return ok({
      text: input.responseSchema ? stripNulls(answer) : answer,
      model: input.model ?? "codex",
    });
  },
};
