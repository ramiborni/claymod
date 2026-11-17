# Mod format v1

A mod is one JSON document. The Zod schema in `packages/core/src/mod/schema.ts` (added in M1) is
the source of truth; a JSON Schema is generated from it for models and tooling. This page
describes it for humans. The format changes only through an issue and a new `schemaVersion`.

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | |
| `id` | uuid | |
| `name`, `description` | string | Short, human-readable |
| `matches` | string[] | [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), at least one |
| `css` | string? | At least one of `css` / `js` |
| `js` | string? | Runs in the `USER_SCRIPT` world |
| `runAt` | `document_start` \| `document_end` \| `document_idle` | |
| `checks` | `{ selector: string, expect: "exists" }[]` | At least one; used for health |
| `version` | int | Incremented on repair or edit |
| `createdBy` | `{ provider: string, model: string }` | |
| `createdAt`, `updatedAt` | ISO string | |
| `history` | previous versions | Kept at most 5 |

## Example

```json
{
  "schemaVersion": 1,
  "id": "6f1c1f4e-3b8a-4f61-9a55-2f3c6d1e9b20",
  "name": "Hide promoted posts",
  "description": "Hides posts marked as promoted on example.com.",
  "matches": ["https://example.com/*"],
  "css": ".post.promoted { display: none !important; }",
  "runAt": "document_start",
  "checks": [{ "selector": ".post", "expect": "exists" }],
  "version": 1,
  "createdBy": { "provider": "openai-compatible", "model": "llama3.1" },
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "history": []
}
```

## Health

On each visit the extension evaluates every check. If checks fail on 3 consecutive visits
(by default), the mod is marked `needs-repair` and the user can ask the model to repair it.

## Writing good mods

- Keep `matches` as narrow as the change allows.
- Prefer CSS; use JS only when CSS can't do it.
- Pick check selectors for the elements the mod depends on, so health reflects real breakage.
