import { describe, expect, test } from "bun:test";
import modDraftSchema from "@claymod/core/schema/mod-draft.schema.json";
import { agentEnv, clearTracingEnv } from "../env";
import { commandLine } from "./command-line";
import { conversationText, fullPromptText } from "./prompt";
import { stripNulls, toStrictSchema } from "./strict-schema";

describe("prompt text", () => {
  test("a single user message is passed as is", () => {
    expect(conversationText([{ role: "user", content: "hi" }])).toBe("hi");
  });

  test("a retry keeps every turn in order", () => {
    const text = conversationText([
      { role: "user", content: "ask" },
      { role: "assistant", content: "bad" },
      { role: "user", content: "fix" },
    ]);
    expect(text.indexOf("<user>\nask")).toBeLessThan(text.indexOf("<assistant>\nbad"));
    expect(text.indexOf("<assistant>\nbad")).toBeLessThan(text.indexOf("<user>\nfix"));
  });

  test("the system prompt goes first for CLIs without a system-prompt flag", () => {
    const text = fullPromptText({ system: "S", messages: [{ role: "user", content: "U" }] });
    expect(text).toBe("<instructions>\nS\n</instructions>\n\nU");
  });
});

describe("strict schema for Codex", () => {
  const strict = toStrictSchema(modDraftSchema);
  const props = strict.properties as Record<string, Record<string, unknown>>;

  test("lists every property as required, with optional ones nullable", () => {
    expect(strict.required).toEqual(Object.keys(modDraftSchema.properties));
    expect(props.css?.type).toEqual(["string", "null"]);
    expect(props.name?.type).toBe("string");
    expect(strict.$schema).toBeUndefined();
    expect(props.name?.minLength).toBeUndefined();
  });

  test("applies to nested objects too", () => {
    const items = props.checks?.items as Record<string, unknown>;
    expect(items.additionalProperties).toBe(false);
    expect(items.required).toEqual(["selector", "expect"]);
  });

  test("stripNulls restores the optional shape", () => {
    expect(stripNulls('{"a":1,"css":null,"js":null}')).toBe('{"a":1}');
    expect(stripNulls("not json")).toBe("not json");
  });
});

describe("environment", () => {
  test("clears LangSmith and LangChain tracing variables", () => {
    const env: Record<string, string | undefined> = {
      LANGSMITH_TRACING: "true",
      LANGCHAIN_API_KEY: "k",
      PATH: "/bin",
    };
    expect(clearTracingEnv(env).sort()).toEqual(["LANGCHAIN_API_KEY", "LANGSMITH_TRACING"]);
    expect(env).toEqual({ PATH: "/bin" });
  });

  test("API-key mode passes a minimal environment with an empty HOME", () => {
    const env = agentEnv({
      base: { PATH: "/bin", HOME: "/home/me", AWS_SECRET: "s", LANG: "en", LANGSMITH_X: "1" },
      auth: "api-key",
      homeDir: "/tmp/h",
      path: "/saved:/bin",
      extra: { CODEX_API_KEY: "k" },
    });
    expect(env).toEqual({
      PATH: "/saved:/bin",
      LANG: "en",
      HOME: "/tmp/h",
      USERPROFILE: "/tmp/h",
      XDG_CONFIG_HOME: "/tmp/h/.config",
      CODEX_API_KEY: "k",
    });
  });

  test("CLI mode keeps the user's environment except tracing", () => {
    const env = agentEnv({
      base: { PATH: "/bin", HOME: "/home/me", CLAUDE_CONFIG_DIR: "/c", LANGCHAIN_X: "1" },
      auth: "cli",
      homeDir: "/tmp/h",
      path: "/bin",
      extra: {},
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/me", CLAUDE_CONFIG_DIR: "/c" });
  });
});

describe("command line", () => {
  test("runs executables directly", () => {
    expect(commandLine("/bin/claude", ["-p"], "linux")).toEqual({
      ok: true,
      value: ["/bin/claude", "-p"],
    });
  });

  test("starts Windows .cmd shims through cmd.exe with quoted arguments", () => {
    expect(commandLine("C:\\npm\\codex.cmd", ["exec", "-C", "C:\\Temp\\a b"], "win32")).toEqual({
      ok: true,
      value: ["cmd.exe", "/d", "/s", "/c", '""C:\\npm\\codex.cmd" "exec" "-C" "C:\\Temp\\a b""'],
    });
  });

  test("refuses arguments cmd.exe would reinterpret", () => {
    expect(commandLine("x.cmd", ['{"a":1}'], "win32")).toEqual({
      ok: false,
      error: "unsafe-for-cmd",
    });
    expect(commandLine("x.cmd", ["100%"], "win32").ok).toBe(false);
  });

  test("refuses arguments over the OS limit", () => {
    expect(commandLine("agy", ["x".repeat(130_000)], "linux")).toEqual({
      ok: false,
      error: "too-long",
    });
    expect(commandLine("agy.exe", ["x".repeat(33_000)], "win32").ok).toBe(false);
  });
});
