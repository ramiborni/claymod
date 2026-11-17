# Starter mods

Ten ready-made mods in [mod format v1](../docs/mod-format.md). Download one and use **Import…** at
the bottom of Claymod's side panel. Imported JavaScript stays off until you've read it.

| Mod | What it does |
| --- | --- |
| [hide-cookie-banners](hide-cookie-banners.json) | Hides banners from common consent tools and generic cookie notices |
| [comfortable-reading-width](comfortable-reading-width.json) | Keeps article lines to about 72 characters |
| [larger-text](larger-text.json) | Article text 12.5% larger, a little more line spacing |
| [underline-links](underline-links.json) | Underlines links inside paragraphs and lists |
| [visible-focus](visible-focus.json) | A clear outline around whatever has keyboard focus |
| [reduce-motion](reduce-motion.json) | Stops animations, transitions and smooth scrolling |
| [hide-newsletter-popups](hide-newsletter-popups.json) | Hides newsletter sign-up dialogs, keeps newsletter links |
| [hide-share-bars](hide-share-bars.json) | Hides social share buttons |
| [simple-dark-mode](simple-dark-mode.json) | Inverts the page's colours, keeps photos and videos as they are |
| [stop-autoplay-video](stop-autoplay-video.json) | Pauses videos that start on their own (JavaScript) |

These run on every website (`*://*/*`), so keeping one asks Chrome for access to all sites. Their
health check is `body`: a generic mod can't know which elements a given site has, and checking for
a cookie banner would flag every site without one as broken. Mods you create for one site check
the elements they actually change.

## Tests

- `mods.test.ts` (`bun test`): every file is a valid mod, ids are unique, file names are slugs,
  and each mod has a fixture test.
- `packages/extension/tests/e2e/starter-mods.e2e.ts` (`bun run e2e`): each mod is applied to the
  synthetic page `packages/extension/tests/fixtures/starter.html` and must make its change.

To add one, see [CONTRIBUTING](../CONTRIBUTING.md) (Option A).
