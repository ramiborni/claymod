import type { Snapshot } from "../snapshot/schema";
import { truncateToBytes } from "../snapshot/truncate";

/** Limits for models with small context windows (on-device models). */
export interface PromptBudget {
  /** Maximum bytes of page outline; the picked element is always kept. */
  outlineBytes: number;
}

/** Renders a snapshot as clearly delimited, untrusted page data. */
export function renderSnapshot(snapshot: Snapshot, budget?: PromptBudget): string {
  const parts = [`URL: ${snapshot.url}`, `Title: ${snapshot.title}`];
  if (snapshot.pickedElement) {
    parts.push(
      `Element the user picked (selector: ${snapshot.pickedElement.selector}):`,
      snapshot.pickedElement.outerHTML,
    );
  }
  const outline = budget
    ? truncateToBytes(snapshot.outline, budget.outlineBytes)
    : snapshot.outline;
  parts.push('Page outline (tag#id.classes [role] "text"):', outline);
  return `<page_snapshot>\n${parts.join("\n\n")}\n</page_snapshot>`;
}
