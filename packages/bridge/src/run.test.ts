import { describe, expect, test } from "bun:test";
import { run } from "./run";
import { testContext } from "./test-context";

describe("run", () => {
  test("prints usage with no arguments", async () => {
    const context = testContext();
    expect(await run([], context)).toBe(0);
    expect(context.stdout.join("\n")).toContain("Usage: claymod-bridge");
    expect(context.stdout.join("\n")).toContain("doctor");
  });

  test("prints the version", async () => {
    const context = testContext();
    expect(await run(["--version"], context)).toBe(0);
    expect(context.stdout).toEqual(["1.2.3"]);
  });

  test("rejects unknown commands with a next step", async () => {
    const context = testContext();
    expect(await run(["frobnicate"], context)).toBe(2);
    expect(context.stderr.join("\n")).toContain("--help");
  });

  test("mcp --help explains how to add it to an agent", async () => {
    const context = testContext();
    expect(await run(["mcp", "--help"], context)).toBe(0);
    expect(context.stdout.join("\n")).toContain("claude mcp add claymod -- claymod-bridge mcp");
  });

  test("Chrome's origin argument starts the host, which refuses unknown extensions", async () => {
    const context = testContext();
    expect(await run([`chrome-extension://${"a".repeat(32)}/`], context)).toBe(1);
    expect(context.stderr.join("\n")).toContain("claymod-bridge install");
  });
});
