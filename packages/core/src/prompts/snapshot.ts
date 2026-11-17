import type { Snapshot } from "../snapshot/schema";

/** Renders a snapshot as clearly delimited, untrusted page data. */
export function renderSnapshot(snapshot: Snapshot): string {
  const parts = [`URL: ${snapshot.url}`, `Title: ${snapshot.title}`];
  if (snapshot.pickedElement) {
    parts.push(
      `Element the user picked (selector: ${snapshot.pickedElement.selector}):`,
      snapshot.pickedElement.outerHTML,
    );
  }
  parts.push('Page outline (tag#id.classes [role] "text"):', snapshot.outline);
  return `<page_snapshot>\n${parts.join("\n\n")}\n</page_snapshot>`;
}
