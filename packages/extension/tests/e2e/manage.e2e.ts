import { readFile } from "node:fs/promises";
import { expect, modState, seedMods, storedMods, test } from "./fixtures";

const CSS_MOD = {
  id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
  name: "Hide promoted posts",
  matches: ["http://127.0.0.1/*"],
  css: ".promoted { display: none !important; }",
  checks: [{ selector: "#content", expect: "exists" as const }],
};

const JS_MOD = {
  schemaVersion: 1,
  id: "7c6b5a49-3827-4615-a4b3-c2d1e0f9a8b7",
  name: "Add a banner",
  description: "Adds a banner with JavaScript.",
  matches: ["http://127.0.0.1/*"],
  js: "document.body.prepend(Object.assign(document.createElement('p'), { textContent: 'Hello from a mod' }));",
  runAt: "document_idle",
  checks: [{ selector: "body", expect: "exists" }],
  version: 3,
  createdBy: { provider: "someone-else", model: "unknown" },
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  history: [],
};

test("imported JavaScript stays off until the code is viewed and enabled", async ({
  openPanel,
  worker,
}) => {
  const { panel } = await openPanel("basic.html");
  await panel.getByRole("tab", { name: "Mods" }).click();
  await panel.getByTestId("import-file").setInputFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "claymod-mods", formatVersion: 1, mods: [JS_MOD] }),
    ),
  });
  await expect(
    panel.getByText("Imported 1 mod. Review any JavaScript before enabling it."),
  ).toBeVisible();
  const card = panel.getByTestId("mod").filter({ hasText: "Add a banner" });
  await expect(card.getByText("JavaScript needs review")).toBeVisible();
  await expect(card.getByRole("button", { name: "Enable JavaScript" })).toHaveCount(0);

  const [id] = Object.keys(await storedMods(worker));
  expect(id).not.toBe(JS_MOD.id); // imported as a new copy
  expect(await modState(worker, id ?? "")).toMatchObject({ jsApproved: false });
  expect(
    await worker.evaluate(async () => {
      try {
        return (await chrome.userScripts.getScripts()).length;
      } catch {
        return 0;
      }
    }),
  ).toBe(0);

  await card.getByRole("button", { name: "View code" }).click();
  await expect(card.getByTestId("code")).toContainText("Hello from a mod");
  await card.getByRole("button", { name: "Enable JavaScript" }).click();
  await expect(card.getByText("JavaScript needs review")).toHaveCount(0);
  expect(await modState(worker, id ?? "")).toMatchObject({ jsApproved: true });
});

test("enable, rename, export and delete from the mod manager", async ({ openPanel, worker }) => {
  await seedMods(worker, [CSS_MOD]);
  const { site, panel } = await openPanel("basic.html");
  await panel.getByRole("tab", { name: "Mods" }).click();
  const card = panel.getByTestId("mod");
  await expect(card.getByRole("heading", { name: "Hide promoted posts" })).toBeVisible();

  await card.getByLabel("Enabled").uncheck();
  await expect(site.locator(".promoted")).toBeVisible();
  await expect(card.getByText("Off", { exact: true })).toBeVisible();
  await card.getByLabel("Enabled").check();
  await expect(site.locator(".promoted")).toBeHidden();

  await card.getByRole("button", { name: "Rename" }).click();
  await card.getByLabel("New name").fill("No ads please");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("heading", { name: "No ads please" })).toBeVisible();
  expect(Object.values(await storedMods(worker))[0]).toMatchObject({
    name: "No ads please",
    version: 2,
  });

  const downloadPromise = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "Export all" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("claymod-no-ads-please.json");
  const exported = JSON.parse(await readFile((await download.path()) ?? "", "utf8"));
  expect(exported).toMatchObject({
    format: "claymod-mods",
    mods: [{ name: "No ads please", css: CSS_MOD.css }],
  });
  expect(exported.mods[0]).not.toHaveProperty("enabled");

  await card.getByRole("button", { name: "Delete" }).click();
  await card.getByRole("button", { name: "Delete for good?" }).click();
  await expect(panel.getByText("No mods for this site yet.")).toBeVisible();
  expect(await storedMods(worker)).toEqual({});
  await expect(site.locator(".promoted")).toBeVisible();
});
