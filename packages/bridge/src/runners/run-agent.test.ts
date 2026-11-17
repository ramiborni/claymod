import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryKeyStore } from "../keys";
import { claudeCode } from "./claude-code";
import { codex } from "./codex";
import { type AgentDeps, runAgent } from "./run-agent";
import type { SpawnRequest, SpawnResult } from "./spawn";
import type { RunInput } from "./types";

const input = (overrides: Partial<RunInput> = {}): RunInput => ({
  prompt: { system: "SYS", messages: [{ role: "user", content: "hi" }] },
  auth: "cli",
  timeoutMs: 5_000,
  ...overrides,
});

const claudeOk = JSON.stringify({ is_error: false, result: "{}", modelUsage: { m: {} } });

function deps(
  answer: (request: SpawnRequest) => Promise<SpawnResult> | SpawnResult,
  overrides: Partial<AgentDeps> = {},
): AgentDeps & { calls: SpawnRequest[] } {
  const calls: SpawnRequest[] = [];
  return {
    calls,
    spawn: async (request) => {
      calls.push(request);
      return answer(request);
    },
    which: (command) => `/fake/bin/${command}`,
    keys: memoryKeyStore(),
    env: { PATH: "/usr/bin", HOME: "/home/me" },
    platform: "linux",
    home: "/home/me",
    tmpRoot: tmpdir(),
    ...overrides,
  };
}

describe("runAgent", () => {
  test("runs in a fresh folder holding the agent's files, then removes it", async () => {
    let seenSystemPrompt = "";
    const d = deps(({ cwd }) => {
      seenSystemPrompt = readFileSync(join(cwd, "system-prompt.md"), "utf8");
      return { exitCode: 0, stdout: claudeOk, stderr: "" };
    });
    const result = await runAgent(claudeCode, input(), d, new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { text: "{}", model: "m" } });
    expect(seenSystemPrompt).toBe("SYS");
    const call = d.calls[0];
    expect(call?.command[0]).toBe("/fake/bin/claude");
    expect(call?.stdin).toBe("hi");
    expect(existsSync(call?.cwd ?? "/")).toBe(false);
  });

  test("API-key mode passes the keychain key and an empty HOME", async () => {
    const d = deps(() => ({ exitCode: 0, stdout: claudeOk, stderr: "" }), {
      keys: memoryKeyStore({ "claude-code": "sk-test" }),
    });
    await runAgent(claudeCode, input({ auth: "api-key" }), d, new AbortController().signal);
    const env = d.calls[0]?.env ?? {};
    expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(env.HOME).toContain("claymod-agent-");
    expect(d.calls[0]?.command).toContain("--bare");
  });

  test("falls back to the key in the environment", async () => {
    const d = deps(() => ({ exitCode: 0, stdout: claudeOk, stderr: "" }), {
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "from-env" },
    });
    await runAgent(claudeCode, input({ auth: "api-key" }), d, new AbortController().signal);
    expect(d.calls[0]?.env.ANTHROPIC_API_KEY).toBe("from-env");
  });

  test("asks for a key when API-key mode has none", async () => {
    const d = deps(() => ({ exitCode: 0, stdout: claudeOk, stderr: "" }));
    const result = await runAgent(
      codex,
      input({ auth: "api-key" }),
      d,
      new AbortController().signal,
    );
    expect(result.ok ? "" : result.error.message).toContain("claymod-bridge keys set codex");
    expect(d.calls).toHaveLength(0);
  });

  test("explains a broken keychain", async () => {
    const d = deps(() => ({ exitCode: 0, stdout: claudeOk, stderr: "" }), {
      keys: { ...memoryKeyStore(), get: async () => Promise.reject(new Error("no dbus")) },
    });
    const result = await runAgent(
      codex,
      input({ auth: "api-key" }),
      d,
      new AbortController().signal,
    );
    expect(result.ok ? "" : result.error.kind).toBe("keychain");
  });

  test("says how to fix a missing agent", async () => {
    const d = deps(() => ({ exitCode: 0, stdout: "", stderr: "" }), { which: () => undefined });
    const result = await runAgent(codex, input(), d, new AbortController().signal);
    expect(result.ok ? "" : result.error.kind).toBe("agent-not-found");
    expect(result.ok ? "" : result.error.message).toContain("claymod-bridge install");
  });

  test("searches the PATH saved at install time first", async () => {
    let searched = "";
    const d = deps(() => ({ exitCode: 0, stdout: claudeOk, stderr: "" }), {
      savedPath: "/saved/bin",
      which: (command, path) => {
        searched = path;
        return `/saved/bin/${command}`;
      },
    });
    await runAgent(claudeCode, input(), d, new AbortController().signal);
    expect(searched.startsWith("/saved/bin:/usr/bin")).toBe(true);
    expect(d.calls[0]?.env.PATH).toBe(searched);
  });

  test("times out and kills the agent", async () => {
    const d = deps(
      ({ signal }) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () =>
            resolve({ exitCode: 143, stdout: "", stderr: "" }),
          ),
        ),
    );
    const result = await runAgent(
      claudeCode,
      input({ timeoutMs: 50 }),
      d,
      new AbortController().signal,
    );
    expect(result.ok ? "" : result.error.kind).toBe("timeout");
  });

  test("reports cancellation", async () => {
    const controller = new AbortController();
    const d = deps(
      ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () =>
            resolve({ exitCode: 143, stdout: "", stderr: "" }),
          );
          controller.abort();
        }),
    );
    const result = await runAgent(claudeCode, input(), d, controller.signal);
    expect(result.ok ? "" : result.error.kind).toBe("cancelled");
  });

  test("reads the answer file Codex writes", async () => {
    const d = deps(async ({ cwd }) => {
      await Bun.write(join(cwd, "answer.txt"), '{"name":"x"}');
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const result = await runAgent(codex, input(), d, new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { text: '{"name":"x"}', model: "codex" } });
  });
});
