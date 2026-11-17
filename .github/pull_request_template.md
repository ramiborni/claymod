## What and why

<!-- One or two sentences. Link the issue if there is one: "Closes #123". -->

## How to try it

<!-- Steps a reviewer can follow. -->

## Checklist

- [ ] `bun run check` passes
- [ ] `bun test` passes (and `bun run e2e` if the extension changed)
- [ ] Bug fixes include a test that fails without the fix
- [ ] Docs updated if behaviour changed
- [ ] Changeset added (`bunx changeset`) for user-visible changes
- [ ] No new dependency, or a one-line justification is below
- [ ] No mod schema change or permission widening, or it was agreed in an issue first
- [ ] Test fixtures are synthetic (no copied third-party HTML, no live sites)
