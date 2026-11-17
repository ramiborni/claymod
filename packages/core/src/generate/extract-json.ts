import { err, ok, type Result } from "../result";

const FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

/**
 * Pulls one JSON value out of a model answer. Models sometimes wrap JSON in Markdown
 * fences or add a sentence around it even when asked not to.
 */
export function extractJson(text: string): Result<unknown, string> {
  const fenced = FENCE.exec(text)?.[1];
  const candidates = [text.trim(), fenced?.trim()];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return ok(JSON.parse(candidate));
    } catch {
      // try the next candidate
    }
  }
  return err("The answer was not valid JSON. Answer with a single JSON object.");
}
