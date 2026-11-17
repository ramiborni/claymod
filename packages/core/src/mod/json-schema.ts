import * as z from "zod";
import { modDraftSchema, modSchema } from "./schema";

export type JsonSchema = { [key: string]: unknown };

/**
 * Refinements (match-pattern checks, "css or js") can't be expressed in JSON Schema. They are
 * still enforced by validateModDraft, and the prompt states them in words.
 */
const options = { target: "draft-2020-12", unrepresentable: "any" } as const;

export const modJsonSchema = (): JsonSchema => z.toJSONSchema(modSchema, options);

export const modDraftJsonSchema = (): JsonSchema => z.toJSONSchema(modDraftSchema, options);

// Anthropic structured outputs return 400 for these keywords; constraints are re-checked by Zod.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
  "pattern",
]);

/** Removes keywords that strict structured-output APIs reject. Pure; returns a new object. */
export function toStrictOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictOutputSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const result: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "minItems" && typeof value === "number" && value > 1) continue;
    result[key] = toStrictOutputSchema(value);
  }
  return result;
}
