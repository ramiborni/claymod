import { describe, expect, test } from "bun:test";
import { AGENT_COMMANDS, type AgentId } from "@claymod/core/bridge-protocol";
import { antigravity } from "./antigravity";
import { claudeCode } from "./claude-code";
import { codex } from "./codex";
import { gemini } from "./gemini";
import { RUNNERS } from "./index";
import type { RunInput } from "./types";

const context = { workDir: "/tmp/w", homeDir: "/tmp/w/home", platform: "linux" as const };
const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
const input = (overrides: Partial<RunInput> = {}): RunInput => ({
  prompt: { system: "SYSTEM", messages: [{ role: "user", content: "USER" }] },
  responseSchema: schema,
  auth: "cli",
  timeoutMs: 60_000,
  ...overrides,
});
const run = (
  stdout: string,
  extra: Partial<{ exitCode: number; stderr: string; outputFile: string }> = {},
) => ({
  exitCode: 0,
  stdout,
  stderr: "",
  ...extra,
});

describe("claude-code", () => {
  test("runs headless with no tools, no MCP and no saved session", () => {
    const invocation = claudeCode.invocation(input({ model: "opus" }), context);
    expect(invocation.args).toEqual([
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
      "--setting-sources",
      "user",
      "--json-schema",
      JSON.stringify(schema),
      "--model",
      "opus",
    ]);
    expect(invocation.files).toEqual({ "system-prompt.md": "SYSTEM" });
    expect(invocation.stdin).toBe("USER");
  });

  test("API-key mode uses --bare, which never reads OAuth or the keychain", () => {
    const { args } = claudeCode.invocation(input({ auth: "api-key" }), context);
    expect(args).toContain("--bare");
    expect(args).not.toContain("--setting-sources");
  });

  test("reads structured_output and the model from modelUsage", () => {
    const stdout = JSON.stringify({
      is_error: false,
      result: '{"name":"x"}',
      structured_output: { name: "x" },
      modelUsage: { "claude-haiku-5-5": {} },
    });
    expect(claudeCode.parse(run(stdout), input())).toEqual({
      ok: true,
      value: { text: '{"name":"x"}', model: "claude-haiku-5-5" },
    });
  });

  test("falls back to the result text without a schema", () => {
    const stdout = JSON.stringify({ is_error: false, result: "{}" });
    const parsed = claudeCode.parse(run(stdout), input({ model: "sonnet" }));
    expect(parsed).toEqual({ ok: true, value: { text: "{}", model: "sonnet" } });
  });

  test("explains a missing sign-in", () => {
    const stdout = JSON.stringify({ is_error: true, result: "Not logged in · Please run /login" });
    const parsed = claudeCode.parse(run(stdout, { exitCode: 1 }), input());
    expect(parsed.ok ? "" : parsed.error.kind).toBe("auth");
    expect(parsed.ok ? "" : parsed.error.message).toContain("Run 'claude' once");
  });

  test("an API-key auth failure points at the saved key", () => {
    const stdout = JSON.stringify({ is_error: true, result: "Invalid API key" });
    const parsed = claudeCode.parse(run(stdout, { exitCode: 1 }), input({ auth: "api-key" }));
    expect(parsed.ok ? "" : parsed.error.message).toContain("claymod-bridge keys set claude-code");
  });

  test("reports other failures with the CLI's own words", () => {
    const parsed = claudeCode.parse(run("", { exitCode: 2, stderr: "boom\nreal reason" }), input());
    expect(parsed.ok ? "" : parsed.error.kind).toBe("agent-failed");
    expect(parsed.ok ? "" : parsed.error.message).toContain("real reason");
  });
});

describe("codex", () => {
  test("runs exec read-only and ephemeral in the work dir, prompt on stdin", () => {
    const invocation = codex.invocation(input({ model: "gpt-6" }), context);
    expect(invocation.args).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-C",
      "/tmp/w",
      "--output-last-message",
      "/tmp/w/answer.txt",
      "--output-schema",
      "/tmp/w/schema.json",
      "--model",
      "gpt-6",
      "-",
    ]);
    expect(invocation.stdin).toContain("SYSTEM");
    expect(invocation.stdin).toContain("USER");
    expect(invocation.outputFile).toBe("answer.txt");
    expect(JSON.parse(invocation.files["schema.json"] ?? "").additionalProperties).toBe(false);
  });

  test("API-key mode isolates CODEX_HOME so a saved login is never used", () => {
    const invocation = codex.invocation(input({ auth: "api-key" }), context);
    expect(invocation.env).toEqual({ CODEX_HOME: "/tmp/w/home/.codex" });
    expect(invocation.files["home/.codex/config.toml"]).toBe("");
    expect(codex.invocation(input(), context).env).toEqual({});
  });

  test("reads the last message and drops the nulls strict mode added", () => {
    const parsed = codex.parse(run("", { outputFile: '{"name":"x","css":null}\n' }), input());
    expect(parsed).toEqual({ ok: true, value: { text: '{"name":"x"}', model: "codex" } });
  });

  test("maps a login failure", () => {
    const parsed = codex.parse(run("", { exitCode: 1, stderr: "Error: not logged in" }), input());
    expect(parsed.ok ? "" : parsed.error.message).toContain("codex login");
  });
});

describe("gemini", () => {
  test("sends the prompt on stdin with -p as the final instruction", () => {
    const invocation = gemini.invocation(input({ model: "flash" }), context);
    expect(invocation.args.slice(0, 2)[0]).toBe("-p");
    expect(invocation.args).toContain("--output-format");
    expect(invocation.args.slice(-2)).toEqual(["--model", "flash"]);
    expect(invocation.stdin).toContain("SYSTEM");
  });

  test("reads response and the model from stats", () => {
    const stdout = JSON.stringify({ response: "{}", stats: { models: { "gemini-3-pro": {} } } });
    expect(gemini.parse(run(stdout), input())).toEqual({
      ok: true,
      value: { text: "{}", model: "gemini-3-pro" },
    });
  });

  test("reports the error object", () => {
    const stdout = JSON.stringify({ error: { message: "Quota exceeded" } });
    const parsed = gemini.parse(run(stdout, { exitCode: 1 }), input());
    expect(parsed.ok ? "" : parsed.error.message).toContain("Quota exceeded");
  });
});

describe("antigravity", () => {
  test("passes the prompt as -p with a JSON schema file, sandboxed, under the timeout", () => {
    const invocation = antigravity.invocation(input(), context);
    expect(invocation.args[0]).toBe("-p");
    expect(invocation.args[1]).toContain("SYSTEM");
    expect(invocation.args).toContain("--sandbox");
    expect(invocation.args).toContain("55s");
    expect(invocation.args).toContain("/tmp/w/schema.json");
  });

  test("API-key mode writes only modelProvider into the empty HOME", () => {
    const invocation = antigravity.invocation(input({ auth: "api-key" }), context);
    expect(invocation.files["home/.gemini/antigravity-cli/settings.json"]).toBe(
      '{"modelProvider":"gemini"}',
    );
  });

  test("reads structured_output on SUCCESS", () => {
    const stdout = JSON.stringify({ status: "SUCCESS", response: "", structured_output: { a: 1 } });
    expect(antigravity.parse(run(stdout), input())).toEqual({
      ok: true,
      value: { text: '{"a":1}', model: "antigravity" },
    });
  });

  test("maps exit code 3 to a timeout and missing auth to a sign-in hint", () => {
    expect(antigravity.parse(run("", { exitCode: 3 }), input())).toMatchObject({
      ok: false,
      error: { kind: "timeout" },
    });
    const stdout = JSON.stringify({ status: "ERROR", error: "authentication required" });
    const parsed = antigravity.parse(run(stdout, { exitCode: 1 }), input());
    expect(parsed.ok ? "" : parsed.error.message).toContain("Run 'agy' once");
  });
});

describe("registry", () => {
  test("every runner's command matches the one the extension shows", () => {
    for (const [id, runner] of Object.entries(RUNNERS)) {
      expect(runner.id).toBe(id as AgentId);
      expect(runner.command).toBe(AGENT_COMMANDS[runner.id]);
    }
  });
});
