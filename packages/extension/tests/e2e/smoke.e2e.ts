import { readFile } from "node:fs/promises";
import { expect, extensionPath, test } from "./fixtures";

test("the built extension loads and its side panel renders", async ({ page, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("heading", { name: "Claymod" })).toBeVisible();
});

test("the manifest keeps install-time permissions minimal", async () => {
  const manifest: unknown = JSON.parse(await readFile(`${extensionPath}/manifest.json`, "utf8"));
  expect(manifest).toMatchObject({ manifest_version: 3, permissions: ["storage", "sidePanel"] });
  expect(manifest).not.toHaveProperty("host_permissions");
  expect(manifest).not.toHaveProperty("content_scripts");
});
