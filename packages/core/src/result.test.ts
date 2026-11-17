import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "./result";

describe("Result", () => {
  test("ok wraps a value", () => {
    const result: Result<number> = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  test("err wraps an error and narrows", () => {
    const result: Result<number> = err("boom");
    if (result.ok) throw new Error("expected an error result");
    expect(result.error).toBe("boom");
  });
});
