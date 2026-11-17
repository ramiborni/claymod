import type * as z from "zod";
import { err, ok, type Result } from "../result";
import { type Mod, type ModDraft, modDraftSchema, modSchema } from "./schema";

/** Human- and model-readable issues, e.g. "matches.0: Not a valid Chrome match pattern". */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function validateWith<T>(schema: z.ZodType<T>, value: unknown): Result<T, string[]> {
  const parsed = schema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(formatIssues(parsed.error));
}

export const validateMod = (value: unknown): Result<Mod, string[]> =>
  validateWith(modSchema, value);

export const validateModDraft = (value: unknown): Result<ModDraft, string[]> =>
  validateWith(modDraftSchema, value);
