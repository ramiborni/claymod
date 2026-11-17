import * as z from "zod";

export const MAX_OUTER_HTML_BYTES = 8 * 1024;
export const MAX_OUTLINE_BYTES = 30 * 1024;

/**
 * A plain, serialisable view of one DOM element. The content script builds this tree
 * (core has no DOM access); renderOutline turns it into text for the prompt.
 */
export interface OutlineNode {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  /** Short visible text directly inside this element. */
  text?: string;
  children?: OutlineNode[];
}

export const pickedElementSchema = z.strictObject({
  selector: z.string().min(1),
  outerHTML: z.string().max(MAX_OUTER_HTML_BYTES + 64),
});

export const snapshotSchema = z.strictObject({
  url: z.url(),
  title: z.string(),
  pickedElement: pickedElementSchema.optional(),
  outline: z.string().max(MAX_OUTLINE_BYTES + 64),
});

export type PickedElement = z.infer<typeof pickedElementSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
