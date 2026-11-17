import { describe, expect, test } from "bun:test";
import { type CheckRun, evaluateHealth, MAX_CHECK_RUNS, recordCheckRun } from "./evaluate";

const pass: CheckRun = { at: "t", failedSelectors: [] };
const fail: CheckRun = { at: "t", failedSelectors: [".post"] };

describe("evaluateHealth", () => {
  test("is healthy with no runs or fewer failures than the threshold", () => {
    expect(evaluateHealth([])).toBe("healthy");
    expect(evaluateHealth([fail, fail])).toBe("healthy");
  });

  test("needs repair after 3 consecutive failures", () => {
    expect(evaluateHealth([pass, fail, fail, fail])).toBe("needs-repair");
  });

  test("a pass in the last 3 runs keeps it healthy", () => {
    expect(evaluateHealth([fail, fail, pass, fail, fail])).toBe("healthy");
  });

  test("respects a custom threshold", () => {
    expect(evaluateHealth([fail], 1)).toBe("needs-repair");
    expect(evaluateHealth([fail, fail, fail], 4)).toBe("healthy");
    expect(() => evaluateHealth([], 0)).toThrow(RangeError);
  });
});

describe("recordCheckRun", () => {
  test("keeps the most recent runs only", () => {
    let runs: CheckRun[] = [];
    for (let i = 0; i < MAX_CHECK_RUNS + 3; i++)
      runs = recordCheckRun(runs, { at: `${i}`, failedSelectors: [] });
    expect(runs).toHaveLength(MAX_CHECK_RUNS);
    expect(runs[0]?.at).toBe("3");
    expect(runs.at(-1)?.at).toBe(`${MAX_CHECK_RUNS + 2}`);
  });
});
