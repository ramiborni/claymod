import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";

test("the built extension loads and its side panel renders", async ({ page, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("heading", { name: "Claymod" })).toBeVisible();
});

test("the production manifest grants no site access at install", async () => {
  const productionManifest = path.resolve(
    import.meta.dirname,
    "../../.output/chrome-mv3/manifest.json",
  );
  const manifest: unknown = JSON.parse(await readFile(productionManifest, "utf8"));
  expect(manifest).toMatchObject({
    manifest_version: 3,
    permissions: ["storage", "sidePanel", "activeTab", "scripting", "userScripts"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
  });
  expect(manifest).not.toHaveProperty("host_permissions");
  expect(manifest).not.toHaveProperty("content_scripts");
});
