import type { Mod, ModDraft } from "../src/mod/schema";
import type { Snapshot } from "../src/snapshot/schema";

export const draft: ModDraft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted.",
  matches: ["https://example.com/*"],
  css: ".post.promoted { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};

export const NOW = "2026-11-17T10:00:00.000Z";
export const LATER = "2026-11-18T10:00:00.000Z";

export const mod: Mod = {
  schemaVersion: 1,
  id: "6f1c1f4e-3b8a-4f61-9a55-2f3c6d1e9b20",
  ...draft,
  version: 1,
  createdBy: { provider: "openai-compatible", model: "llama3.1:8b" },
  createdAt: NOW,
  updatedAt: NOW,
  history: [],
};

export const snapshot: Snapshot = {
  url: "https://example.com/feed",
  title: "Example feed",
  pickedElement: {
    selector: "article.post.promoted",
    outerHTML: '<article class="post promoted">Promoted post</article>',
  },
  outline:
    'body\n  main#content\n    article.post "First post"\n    article.post.promoted "Promoted post"',
};
