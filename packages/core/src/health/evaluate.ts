export const DEFAULT_FAILURE_THRESHOLD = 3;
export const MAX_CHECK_RUNS = 10;

/** The result of running a mod's checks on one visit. */
export interface CheckRun {
  at: string;
  failedSelectors: string[];
}

export type Health = "healthy" | "needs-repair";

export const runPassed = (run: CheckRun): boolean => run.failedSelectors.length === 0;

/** Appends a run, keeping only the most recent MAX_CHECK_RUNS (oldest first). */
export function recordCheckRun(runs: readonly CheckRun[], run: CheckRun): CheckRun[] {
  return [...runs, run].slice(-MAX_CHECK_RUNS);
}

/**
 * A mod needs repair when its checks failed on the last `threshold` visits in a row.
 * One flaky visit (slow page, A/B test) should not flag it.
 */
export function evaluateHealth(
  runs: readonly CheckRun[],
  threshold = DEFAULT_FAILURE_THRESHOLD,
): Health {
  if (threshold < 1) throw new RangeError("threshold must be at least 1");
  const recent = runs.slice(-threshold);
  if (recent.length < threshold) return "healthy";
  return recent.every((run) => !runPassed(run)) ? "needs-repair" : "healthy";
}
