import { err, ok } from "@claymod/core";
import { failure, firstKey, parseJsonObject, runFailure } from "./errors";
import { conversationText } from "./prompt";
import type { AgentRunner } from "./types";

const SIGN_IN_HINT = "Run 'claude' once in a terminal and sign in, then try again.";

/**
 * Claude Code in headless mode (`claude -p`), documented at
 * https://code.claude.com/docs/en/headless. No tools, no MCP servers, no saved session.
 * CLI mode keeps the user's own sign-in and user settings (Anthropic's terms allow an unmodified
 * Claude Code signed in by the user). API-key mode adds --bare, which reads ANTHROPIC_API_KEY
 * only and never OAuth or the keychain.
 */
export const claudeCode: AgentRunner = {
  id: "claude-code",
  command: "claude",
  keyEnv: "ANTHROPIC_API_KEY",
  signInCheck: ["auth", "status"],
  signInHint: SIGN_IN_HINT,

  invocation(input) {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--system-prompt-file",
      "system-prompt.md",
      "--tools",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--disable-slash-commands",
      ...(input.auth === "api-key" ? ["--bare"] : ["--setting-sources", "user"]),
      ...(input.responseSchema ? ["--json-schema", JSON.stringify(input.responseSchema)] : []),
      ...(input.model ? ["--model", input.model] : []),
    ];
    return {
      args,
      stdin: conversationText(input.prompt.messages),
      env: {},
      files: { "system-prompt.md": input.prompt.system },
    };
  },

  parse(output, input) {
    const result = parseJsonObject(output.stdout);
    if (!result) {
      return err(
        runFailure(
          "claude-code",
          input.auth,
          SIGN_IN_HINT,
          output.stderr || output.stdout,
          output.exitCode,
        ),
      );
    }
    const text = typeof result.result === "string" ? result.result : "";
    if (result.is_error === true || output.exitCode !== 0) {
      return err(
        runFailure("claude-code", input.auth, SIGN_IN_HINT, text || output.stderr, output.exitCode),
      );
    }
    const answer =
      result.structured_output !== undefined ? JSON.stringify(result.structured_output) : text;
    if (!answer) return err(failure("claude-code", "it returned an empty answer"));
    return ok({ text: answer, model: firstKey(result.modelUsage) ?? input.model ?? "claude-code" });
  },
};
