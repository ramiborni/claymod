# Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) and
`.github/workflows/release.yml`. Uploading to the Chrome Web Store is a manual step.

## What a release ships

`bun run release:artifacts` (the workflow runs the same script) writes to `dist/release/`:

| File | What it is |
| --- | --- |
| `claymod-extension-<version>-chrome.zip` | The extension (`wxt zip`), including the IBM Plex fonts and the on-device model libraries, verified against their pinned hashes |
| `claymod-bridge-<version>-darwin-arm64` / `-darwin-x64` / `-linux-x64` / `-windows-x64.exe` | claymod-bridge, compiled with `bun build --compile` (about 90–120 MB each: they embed the Bun runtime) |
| `SHA256SUMS` | Checksums of the files above |

and `dist/release-notes.md`, this version's section of `packages/extension/CHANGELOG.md`.

## The flow

1. Every user-visible change comes with a changeset (`bunx changeset`).
2. On `main`, the **version** job opens or updates a "chore: version packages" PR: it bumps
   `packages/*/package.json` and writes the changelogs. The release version is the extension's.
3. Merging that PR runs the **release** job: check and unit tests, `bun run release:artifacts`,
   [build provenance attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)
   for every file, then a GitHub Release `v<version>` with the files attached.
   A version that already has a tag is skipped.

Repository settings the workflow needs: **Settings → Actions → General → Workflow permissions**:
allow GitHub Actions to create and approve pull requests (for the version PR).

## Dry run

- **Locally:** `bun run release:artifacts`, then `cd dist/release && sha256sum -c SHA256SUMS`.
  Cross-compiling downloads the Bun runtime for each target once.
- **On GitHub (a fork works):** Actions → Release → **Run workflow** with "dry run" ticked. It
  builds, attests and uploads everything as a workflow artifact named `claymod-<version>`, and
  creates no tag or release. Untick it to publish a release by hand (only if the version has no
  tag yet).

Check a downloaded file's provenance with `gh attestation verify <file> --repo ramiborni/claymod`.

## Chrome Web Store (manual)

1. Download `claymod-extension-<version>-chrome.zip` from the GitHub Release (don't rebuild it:
   the attested zip is the one to ship).
2. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   open Claymod (or **New item** the first time) and upload the zip under **Package**.
3. **Store listing:** the description from the README's first paragraph, the 128 px icon
   (`packages/extension/public/icon/128.png`), and screenshots at 1280×800 or 640×400 (start from
   `docs/screenshots/`).
4. **Privacy practices:**
   - Single purpose: "Change how websites look and work with small mods you describe."
   - Permission justifications:
     - `storage`: saves mods and settings in the browser.
     - `sidePanel`: the main interface.
     - `activeTab`: reads the current page after you click the icon.
     - `scripting`: previews and applies CSS mods.
     - `userScripts`: runs reviewed JavaScript mods in Chrome's isolated user-script world.
     - Optional `nativeMessaging`: talks to claymod-bridge, only if you choose a local agent or MCP.
     - Optional host permissions: requested per site when you keep a mod.
   - Remote code: **No**. All code ships in the package, including the WebAssembly libraries for
     on-device models. Model weights are data.
   - Data use: page snapshots go only to the AI provider the user configures; Claymod collects
     nothing.
5. Submit for review. Once published, put the store link in the README's **Install** section and,
   if the store ID differs from the one used in `claymod-bridge install`, mention it in
   [bridge.md](bridge.md).
