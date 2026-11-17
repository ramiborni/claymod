const encoder = new TextEncoder();

export const byteLength = (text: string): number => encoder.encode(text).length;

export const TRUNCATION_MARKER = "\n<!-- truncated by Claymod -->";

/** Cuts text to at most maxBytes of UTF-8, never splitting a character, and marks the cut. */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(text.slice(0, mid)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  // Don't leave half of a surrogate pair at the end.
  const code = text.charCodeAt(low - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? low - 1 : low;
  return text.slice(0, end) + TRUNCATION_MARKER;
}
