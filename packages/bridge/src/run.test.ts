import { describe, expect, test } from "bun:test";
import { run } from "./run";

describe("run", () => {
  test("prints usage with no arguments", () => {
    const output = run([]);
    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain("Usage: claymod-bridge");
    expect(output.stdout).toContain("doctor");
  });

  test("rejects unknown commands with a next step", () => {
    const output = run(["frobnicate"]);
    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain("--help");
  });

  test("known commands report the milestone they arrive in", () => {
    const output = run(["host"]);
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain("M4");
  });
});
