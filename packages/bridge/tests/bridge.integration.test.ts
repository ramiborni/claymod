/**
 * End to end on the bridge side: `install` from source, then start the registered launcher the
 * way Chrome does (origin argument, a short PATH, framed JSON on stdin/stdout) against fake agent
 * CLIs. Nothing touches the real home folder, keychain or network.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeFrame, FrameDecoder } from "../src/host/framing";

const ID = "abcdefghijklmnopabcdefghijklmnop";
const ORIGIN = `chrome-extension://${ID}/`;
const CLI = join(import.meta.dir, "../src/cli.ts");
const FAKE = join(import.meta.dir, "fixtures/fake-agent.ts");
const prompt = { system: "SYSTEM RULES", messages: [{ role: "user", content: "make it blue" }] };

let root = "";
let home = "";
let bin = "";

/** The environment Chrome would give the host: no agent folder on PATH, tracing switched on. */
const chromeEnv = () => ({
  HOME: home,
  PATH: "/usr/bin:/bin",
  CLAYMOD_BRIDGE_NO_KEYCHAIN: "1",
  LANGSMITH_TRACING: "true",
  LANGCHAIN_TRACING_V2: "true",
  SECRET_FROM_SHELL: "do-not-leak",
  CODEX_API_KEY: "sk-codex-env",
  GEMINI_API_KEY: "gm-env",
  TMPDIR: root,
});

function calls(): {
  agent: string;
  args: string[];
  env: Record<string, string | null>;
  stdin: string;
  files: string[];
}[] {
  try {
    return readFileSync(join(bin, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function setMode(mode: "ok" | "auth" | "slow") {
  writeFileSync(join(bin, "mode.txt"), mode);
  rmSync(join(bin, "calls.jsonl"), { force: true });
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "claymod-bridge-it-"));
  home = join(root, "home");
  bin = join(root, "agents-bin");
  mkdirSync(home);
  mkdirSync(bin);
  for (const command of ["claude", "codex", "gemini", "agy"]) {
    const path = join(bin, command);
    writeFileSync(
      path,
      `#!/bin/sh\nexec '${process.execPath}' '${FAKE}' '${bin}' ${command} "$@"\n`,
    );
    chmodSync(path, 0o755);
  }
  // `install` runs in the user's terminal, where the agents are on PATH; it remembers that PATH.
  const install = Bun.spawnSync(
    [process.execPath, CLI, "install", "--extension-id", ID, "--browser", "chrome"],
    {
      env: { ...chromeEnv(), PATH: `${bin}:/usr/bin:/bin` },
    },
  );
  expect(install.exitCode).toBe(0);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function manifest(): { path: string; allowed_origins: string[] } {
  return JSON.parse(
    readFileSync(
      join(home, ".config/google-chrome/NativeMessagingHosts/claymod.bridge.json"),
      "utf8",
    ),
  );
}

/** Starts the host like Chrome does and exchanges framed messages with it. */
function startHost(origin = ORIGIN) {
  const child = Bun.spawn([manifest().path, origin], {
    env: chromeEnv(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const decoder = new FrameDecoder();
  const responses: {
    id: string;
    ok: boolean;
    value?: unknown;
    error?: { kind: string; message: string };
  }[] = [];
  const reading = (async () => {
    for await (const chunk of child.stdout) {
      for (const frame of decoder.push(chunk))
        if (frame.ok) responses.push(frame.message as (typeof responses)[number]);
    }
  })();
  return {
    child,
    send(message: unknown) {
      const encoded = encodeFrame(message);
      if (!encoded.ok) throw new Error("too large");
      child.stdin.write(encoded.frame);
      child.stdin.flush();
    },
    async response(id: string, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = responses.find((r) => r.id === id);
        if (found) return found;
        await Bun.sleep(20);
      }
      throw new Error(`no response for ${id}; stderr: ${await new Response(child.stderr).text()}`);
    },
    async close() {
      await child.stdin.end();
      const code = await child.exited;
      await reading;
      return code;
    },
  };
}

// The fake agents are shell scripts; Windows runs the same logic through the unit tests.
describe.skipIf(process.platform === "win32")("claymod-bridge with fake agents", () => {
  test("install registers a launcher limited to the extension", () => {
    const registered = manifest();
    expect(registered.allowed_origins).toEqual([ORIGIN]);
    expect(registered.path).toBe(join(home, ".config/claymod/claymod-bridge-host"));
  });

  test("hello finds every agent through the PATH saved at install", async () => {
    const host = startHost();
    host.send({ type: "hello", id: "h" });
    const hello = await host.response("h");
    expect(await host.close()).toBe(0);
    const value = hello.value as { agents: { id: string; found: boolean }[]; keychain: boolean };
    expect(value.agents.every((agent) => agent.found)).toBe(true);
    expect(value.keychain).toBe(false);
  });

  test("Claude Code with the CLI's own sign-in: user settings, no tools, no tracing", async () => {
    setMode("ok");
    const host = startHost();
    host.send({
      type: "generate",
      id: "g",
      agent: "claude-code",
      auth: "cli",
      prompt,
      responseSchema: { type: "object" },
    });
    const response = await host.response("g");
    await host.close();
    expect(response).toMatchObject({ ok: true, value: { model: "claude-fake-1" } });
    expect(JSON.parse((response.value as { text: string }).text).name).toBe("From claude");
    const [call] = calls();
    expect(call?.args).toContain("--setting-sources");
    expect(call?.args).not.toContain("--bare");
    expect(
      call?.args.slice(call.args.indexOf("--tools"), call.args.indexOf("--tools") + 2),
    ).toEqual(["--tools", ""]);
    expect(call?.stdin).toBe("make it blue");
    expect(call?.files).toContain("system-prompt.md");
    expect(call?.env.HOME).toBe(home);
    expect(call?.env.LANGSMITH_TRACING).toBeNull();
    expect(call?.env.LANGCHAIN_TRACING_V2).toBeNull();
  });

  test("Codex with an API key: isolated home, key from the environment, nothing else leaks", async () => {
    setMode("ok");
    const host = startHost();
    host.send({
      type: "generate",
      id: "g",
      agent: "codex",
      auth: "api-key",
      prompt,
      responseSchema: { type: "object", properties: { js: { type: "string" } } },
    });
    const response = await host.response("g");
    await host.close();
    expect(response.ok).toBe(true);
    expect((response.value as { text: string }).text).not.toContain("null");
    const [call] = calls();
    expect(call?.env.CODEX_API_KEY).toBe("sk-codex-env");
    expect(call?.env.HOME).not.toBe(home);
    expect(call?.env.CODEX_HOME).toContain("claymod-agent-");
    expect(call?.env.SECRET_FROM_SHELL).toBeNull();
    expect(call?.args).toEqual(expect.arrayContaining(["--sandbox", "read-only", "--ephemeral"]));
    expect(call?.stdin).toContain("SYSTEM RULES");
  });

  test("Gemini CLI and Antigravity answer through the same protocol", async () => {
    setMode("ok");
    const host = startHost();
    host.send({ type: "generate", id: "gm", agent: "gemini", auth: "api-key", prompt });
    host.send({
      type: "generate",
      id: "ag",
      agent: "antigravity",
      auth: "api-key",
      prompt,
      responseSchema: { type: "object" },
    });
    const [gemini, agy] = [await host.response("gm"), await host.response("ag")];
    await host.close();
    expect(gemini).toMatchObject({ ok: true, value: { model: "gemini-fake" } });
    expect(agy).toMatchObject({ ok: true, value: { model: "antigravity" } });
    const agyCall = calls().find((call) => call.agent === "agy");
    expect(agyCall?.env.GEMINI_API_KEY).toBe("gm-env");
    expect(agyCall?.files).toContain("home/.gemini/antigravity-cli/settings.json");
  });

  test("a missing sign-in comes back as an auth error with the next step", async () => {
    setMode("auth");
    const host = startHost();
    host.send({ type: "generate", id: "g", agent: "claude-code", auth: "cli", prompt });
    const response = await host.response("g");
    await host.close();
    expect(response).toMatchObject({ ok: false, error: { kind: "auth" } });
    expect(response.error?.message).toContain("Run 'claude' once");
  });

  test("a slow agent times out, and closing the port stops it", async () => {
    setMode("slow");
    const host = startHost();
    host.send({ type: "generate", id: "t", agent: "codex", auth: "cli", prompt, timeoutMs: 1_000 });
    const response = await host.response("t");
    expect(response).toMatchObject({ ok: false, error: { kind: "timeout" } });
    host.send({ type: "generate", id: "left-running", agent: "gemini", auth: "cli", prompt });
    await Bun.sleep(300);
    const started = Date.now();
    expect(await host.close()).toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("the host refuses an extension that install didn't allow", async () => {
    const host = startHost(`chrome-extension://${"b".repeat(32)}/`);
    expect(await host.close()).toBe(1);
  });

  test("doctor reports the setup", () => {
    setMode("ok");
    const doctor = Bun.spawnSync([process.execPath, CLI, "doctor"], { env: chromeEnv() });
    const report = doctor.stdout.toString();
    expect(report).toContain("✓ Chrome: registered");
    expect(report).toContain("Claude Code:");
    expect(report).toContain("signed in");
    expect(report).toContain("Cleared LANGSMITH_TRACING, LANGCHAIN_TRACING_V2");
    expect(doctor.exitCode).toBe(0);
  });
});
