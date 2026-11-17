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
