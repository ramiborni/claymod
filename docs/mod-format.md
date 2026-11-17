# Mod format v1

A mod is one JSON document. The Zod schema in `packages/core/src/mod/schema.ts` is the source of
truth. JSON Schemas generated from it live in `packages/core/schema/`:

- `mod.schema.json` describes a stored mod (use it as `$schema` in editors);
- `mod-draft.schema.json` describes the part a model writes (see below).

Regenerate them with `bun run --cwd packages/core schema:export`; a unit test fails if they are
out of date. This page describes the format for humans. It changes only through an issue and a
new `schemaVersion`.

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | |
| `id` | uuid | |
| `name`, `description` | string | Short, human-readable (name 1–80 chars, description ≤ 500) |
| `matches` | string[] | [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), at least one; `http`, `https`, `*` schemes or `<all_urls>` only |
| `css` | string? | At least one of `css` / `js` |
| `js` | string? | Runs in the `USER_SCRIPT` world |
| `runAt` | `document_start` \| `document_end` \| `document_idle` | |
| `checks` | `{ selector: string, expect: "exists" }[]` | At least one; used for health |
| `version` | int | Incremented on repair or edit |
| `createdBy` | `{ provider: string, model: string }` | |
| `createdAt`, `updatedAt` | ISO string | |
| `history` | previous versions | Kept at most 5, newest first |

Unknown fields are rejected. A history entry has the draft fields plus `version`, `createdBy` and
`updatedAt`.

## Drafts: what the model writes

Models only write `name`, `description`, `matches`, `css`, `js`, `runAt` and `checks`. Claymod
validates that draft, then adds `schemaVersion`, `id`, `version`, `createdBy`, the timestamps and
`history` itself. A model can't set a mod's identity, version or history.

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

On each visit (and each single-page-app navigation) the extension evaluates every check once
the page has settled. If checks fail on 3 consecutive visits (by default), the mod is marked
`needs-repair` and the user can ask the model to repair it. Repairs and edits save a new
`version` and keep the previous one in `history` (at most 5); Undo restores it.

## Sharing

Exports wrap mods as `{ "format": "claymod-mods", "formatVersion": 1, "exportedAt": "…",
"mods": [ … ] }`. Only the mods are shared: whether a mod is enabled, its check results and
paused sites stay local. Imported mods get new ids, and their JavaScript stays off until you
read it and enable it.

## Writing good mods

- Keep `matches` as narrow as the change allows.
- Prefer CSS; use JS only when CSS can't do it.
- Pick check selectors for the elements the mod depends on, so health reflects real breakage.
