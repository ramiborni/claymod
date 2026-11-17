import * as z from "zod";
import { isValidMatchPattern } from "./match-pattern";

/** Mod format v1. See docs/mod-format.md. Do not change without an issue and a schemaVersion bump. */

export const MAX_HISTORY = 5;

export const runAtSchema = z.enum(["document_start", "document_end", "document_idle"]);

export const checkSchema = z.strictObject({
  selector: z.string().min(1).describe("CSS selector that must match on a healthy page"),
  expect: z.literal("exists"),
});

export const matchPatternSchema = z
  .string()
  .refine(isValidMatchPattern, { message: "Not a valid Chrome match pattern for http(s) pages" })
  .describe('Chrome match pattern, e.g. "https://example.com/*"');

export const createdBySchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
});

/** The fields a model writes. Everything else is filled in by Claymod. */
const draftShape = {
  name: z.string().min(1).max(80).describe("Short, human-readable name"),
  description: z.string().max(500).describe("One or two sentences on what the mod changes"),
  matches: z.array(matchPatternSchema).min(1).describe("Pages the mod runs on"),
  css: z.string().optional().describe("CSS to inject"),
  js: z.string().optional().describe("JavaScript run in an isolated user-script world"),
  runAt: runAtSchema,
  checks: z.array(checkSchema).min(1).describe("Selectors the mod depends on"),
};

const hasCode = (mod: { css?: string | undefined; js?: string | undefined }) =>
  Boolean(mod.css?.trim() || mod.js?.trim());
const hasCodeIssue = { message: "A mod needs css or js (or both)", path: ["css"] };

export const modDraftSchema = z.strictObject(draftShape).refine(hasCode, hasCodeIssue);

export const modVersionSchema = z.strictObject({
  ...draftShape,
  version: z.int().min(1),
  createdBy: createdBySchema,
  updatedAt: z.iso.datetime(),
});

export const modSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    ...draftShape,
    version: z.int().min(1),
    createdBy: createdBySchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    history: z.array(modVersionSchema).max(MAX_HISTORY),
  })
  .refine(hasCode, hasCodeIssue);

export type RunAt = z.infer<typeof runAtSchema>;
export type Check = z.infer<typeof checkSchema>;
export type CreatedBy = z.infer<typeof createdBySchema>;
export type ModDraft = z.infer<typeof modDraftSchema>;
export type ModVersion = z.infer<typeof modVersionSchema>;
export type Mod = z.infer<typeof modSchema>;
