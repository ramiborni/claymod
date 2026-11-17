import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../config";
import { memoryKeyStore } from "../keys";
import { configDir } from "../paths";
import { run } from "../run";
import { testContext } from "../test-context";
import { planInstall } from "./install-plan";

const ID = "abcdefghijklmnopabcdefghijklmnop";

describe("install", () => {
  test("writes a manifest limited to the extension, and remembers the PATH", async () => {
    const context = testContext({ env: { PATH: "/home/me/.local/bin:/usr/bin" } });
    mkdirSync(join(context.home, ".config", "chromium"), { recursive: true });
    expect(await run(["install", "--extension-id", ID], context)).toBe(0);

    const manifestFile = join(
      context.home,
      ".config/chromium/NativeMessagingHosts/claymod.bridge.json",
    );
    expect(JSON.parse(readFileSync(manifestFile, "utf8"))).toEqual({
      name: "claymod.bridge",
      description: "Claymod bridge: runs local AI agents for the Claymod extension",
      path: "/opt/claymod/claymod-bridge",
      type: "stdio",
      allowed_origins: [`chrome-extension://${ID}/`],
    });
    expect(existsSync(join(context.home, ".config/google-chrome/NativeMessagingHosts"))).toBe(
      false,
    );
    const config = await readConfig(configDir(context));
    expect(config).toMatchObject({
      extensionIds: [ID],
      browsers: ["chromium"],
      path: "/home/me/.local/bin:/usr/bin",
    });
    expect(context.stdout.join("\n")).toContain("Test connection");
  });

  test("defaults to Chrome when no browser folder exists", async () => {
    const context = testContext();
    expect(await run(["install", "--extension-id", ID], context)).toBe(0);
    expect(
      existsSync(
        join(context.home, ".config/google-chrome/NativeMessagingHosts/claymod.bridge.json"),
      ),
    ).toBe(true);
  });

  test("refuses a malformed extension ID", async () => {
    const context = testContext();
    expect(await run(["install", "--extension-id", "chrome-extension://x"], context)).toBe(2);
    expect(context.stderr.join("\n")).toContain("32 letters");
  });

  test("asks for the extension ID the first time", async () => {
    const context = testContext();
    expect(await run(["install"], context)).toBe(2);
    expect(context.stderr.join("\n")).toContain("--extension-id");
  });

  test("from source, writes an executable launcher that runs bun with the entry script", async () => {
    const context = testContext({
      execPath: "/usr/local/bin/bun",
      mainScript: "/src/claymod's/cli.ts",
    });
    expect(await run(["install", "--extension-id", ID, "--browser", "chrome"], context)).toBe(0);
    const launcher = join(configDir(context), "claymod-bridge-host");
    expect(readFileSync(launcher, "utf8")).toBe(
      "#!/bin/sh\nexec '/usr/local/bin/bun' '/src/claymod'\\''s/cli.ts' \"$@\"\n",
    );
    expect(statSync(launcher).mode & 0o111).not.toBe(0);
  });

  test("on Windows, points registry keys at manifests in Claymod's folder", () => {
    const plan = planInstall({
      machine: {
        platform: "win32",
        home: "C:\\Users\\me",
        env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
      },
      self: { execPath: "C:\\Tools\\claymod-bridge.exe", mainScript: "B:\\~BUN\\root\\cli" },
      browsers: ["chrome", "chromium"],
      extensionIds: [ID],
    });
    expect(plan.hostPath).toBe("C:\\Tools\\claymod-bridge.exe");
    expect(plan.registry.map((entry) => entry.key)).toEqual([
      "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\claymod.bridge",
      "HKCU\\Software\\Chromium\\NativeMessagingHosts\\claymod.bridge",
    ]);
    expect(plan.registry[0]?.manifest).toContain("Claymod");
  });

  test("on macOS, writes under Application Support", () => {
    const plan = planInstall({
      machine: { platform: "darwin", home: "/Users/me", env: {} },
      self: { execPath: "/usr/local/bin/claymod-bridge", mainScript: "/$bunfs/root/cli" },
      browsers: ["chrome"],
      extensionIds: [ID],
    });
    expect(plan.files[0]?.path).toBe(
      "/Users/me/Library/Application Support/Google/Chrome/NativeMessagingHosts/claymod.bridge.json",
    );
  });
});

describe("uninstall", () => {
  test("removes manifests, settings and saved keys", async () => {
    const keys = memoryKeyStore({ codex: "k" });
    const context = testContext({ keys });
    await run(["install", "--extension-id", ID], context);
    expect(await run(["uninstall"], context)).toBe(0);
    expect(
      existsSync(
        join(context.home, ".config/google-chrome/NativeMessagingHosts/claymod.bridge.json"),
      ),
    ).toBe(false);
    expect(existsSync(configDir(context))).toBe(false);
    expect(await keys.get("codex")).toBeUndefined();
  });
});

describe("doctor", () => {
  test("reports registration, agents, sign-in and keys without printing keys", async () => {
    const context = testContext({
      keys: memoryKeyStore({ codex: "sk-secret" }),
      which: (command) =>
        command === "claude" || command === "codex" ? `/bin/${command}` : undefined,
      clearedTracing: ["LANGSMITH_TRACING"],
    });
    context.execPath = join(context.home, "claymod-bridge");
    writeFileSync(context.execPath, "");
    await run(["install", "--extension-id", ID], context);
    expect(await run(["doctor"], context)).toBe(0);
    const report = context.stdout.join("\n");
    expect(report).toContain("✓ Chrome: registered");
    expect(report).toContain("✓ Claude Code: /bin/claude · signed in · no API key");
    expect(report).toContain("✓ Codex: /bin/codex · signed in · API key saved");
    expect(report).toContain("– Antigravity CLI: 'agy' not found");
    expect(report).toContain("Cleared LANGSMITH_TRACING");
    expect(report).not.toContain("sk-secret");
    expect(context.spawned.map((call) => call.command)).toContainEqual([
      "/bin/claude",
      "auth",
      "status",
    ]);
  });

  test("fails with the install command when nothing is registered", async () => {
    const context = testContext({ which: () => "/bin/claude" });
    expect(await run(["doctor"], context)).toBe(1);
    expect(context.stdout.join("\n")).toContain("claymod-bridge install --extension-id");
  });
});

describe("keys", () => {
  test("set saves the typed key, list never shows it, delete removes it", async () => {
    const keys = memoryKeyStore();
    const context = testContext({ keys, readSecret: async () => "  sk-typed \n" });
    expect(await run(["keys", "set", "gemini"], context)).toBe(0);
    expect(await keys.get("gemini")).toBe("sk-typed");
    await run(["keys", "list"], context);
    expect(context.stdout).toContain("Gemini CLI (gemini): saved");
    expect(context.stdout.join("\n")).not.toContain("sk-typed");
    expect(await run(["keys", "delete", "gemini"], context)).toBe(0);
    expect(await keys.get("gemini")).toBeUndefined();
  });

  test("rejects unknown agents and empty keys", async () => {
    expect(await run(["keys", "set", "bash"], testContext())).toBe(2);
    expect(await run(["keys", "set", "codex"], testContext())).toBe(2);
  });
});

describe("browsers", () => {
  test("Chrome for Testing has its own folder on Linux and isn't offered on Windows", async () => {
    const context = testContext();
    expect(
      await run(["install", "--extension-id", ID, "--browser", "chrome-for-testing"], context),
    ).toBe(0);
    expect(
      existsSync(
        join(
          context.home,
          ".config/google-chrome-for-testing/NativeMessagingHosts/claymod.bridge.json",
        ),
      ),
    ).toBe(true);
    const windows = testContext({ platform: "win32" });
    expect(
      await run(["install", "--extension-id", ID, "--browser", "chrome-for-testing"], windows),
    ).toBe(2);
  });
});
