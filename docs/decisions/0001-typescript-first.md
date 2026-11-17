# 0001. TypeScript first, on Bun

- Status: accepted
- Date: 2026-11-17

## Context

Claymod has three parts: a browser extension, a pure library shared by everything, and a local
CLI (native messaging host and MCP server). They exchange the same data (mods, snapshots,
provider requests), and contributors should be able to work on all of them without switching
languages or toolchains.

## Decision

- Write everything in strict TypeScript.
- Use Bun for package management, workspaces, unit tests and the bridge runtime. The bridge ships
  as a single binary via `bun build --compile`, so users don't need Bun or Node installed.
- Build the extension with WXT (Vite-based, Manifest V3).
- Keep the mod schema in Zod inside `packages/core` and derive both the TypeScript types and the
  JSON Schema from it.
- Use Biome for lint and format, one tool instead of ESLint + Prettier.

## Consequences

- One schema, one set of types, one test runner and one language across the codebase.
- `packages/core` must stay free of browser and Node APIs so it runs everywhere.
- The bridge depends on Bun's cross-compilation targets; if a platform isn't supported we
  revisit this for the bridge only.
- TypeScript is pinned to 6.0.x for now: TypeScript 7 (the native port) is newer than our
  toolchain (WXT, editors) has been verified against. Revisit once WXT documents support.
