import * as z from "zod";

/**
 * Per-mod settings kept beside the mod, not in it: the mod format stays exactly as defined
 * in core, so exports and imports never carry local state.
 */
export const modStateSchema = z.object({
  enabled: z.boolean(),
  /** JS runs only after the user saw it (preview or View code). Imports start false. */
  jsApproved: z.boolean(),
  checkRuns: z.array(z.object({ at: z.string(), failedSelectors: z.array(z.string()) })),
  health: z.enum(["healthy", "needs-repair"]),
});

export type ModState = z.infer<typeof modStateSchema>;

export const newModState = (jsApproved: boolean): ModState => ({
  enabled: true,
  jsApproved,
  checkRuns: [],
  health: "healthy",
});

/** Hostnames where the user paused every mod (the per-site kill switch). */
export const pausedSitesSchema = z.array(z.string());
