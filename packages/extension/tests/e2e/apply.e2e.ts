import { expect, seedMods, storedMods, test, useMockProvider } from "./fixtures";

const HIDE_PROMOTED = {
  id: "0b6c1f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f",
  name: "Hide promoted posts",
  matches: ["http://127.0.0.1/*"],
  css: ".promoted { display: none !important; }",
  checks: [{ selector: "#content", expect: "exists" as const }],
};

test("a kept mod applies on every visit and survives reloads", async ({
  context,
  server,
  worker,
}) => {
  await seedMods(worker, [HIDE_PROMOTED]);
  const page = await context.newPage();
  await page.goto(`${server.origin}/fixtures/basic.html`);
  await expect(page.locator(".promoted")).toBeHidden();
  await expect(page.locator(".post").first()).toBeVisible();
  await page.reload();
  await expect(page.locator(".promoted")).toBeHidden();
  // The badge shows how many mods are active on the page.
  const tabId = await worker.evaluate(
    async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0]?.id,
  );
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe("1");
});

test("a mod created in the side panel is still applied after a reload", async ({
  openPanel,
  server,
  worker,
}) => {
  await useMockProvider(worker, server);
  const draft = {
    ...HIDE_PROMOTED,
    id: undefined,
    description: "Hides promoted posts.",
    runAt: "document_start",
    checks: [{ selector: ".post", expect: "exists" }],
  };
  server.model = { status: 200, content: JSON.stringify(draft) };
  const { site, panel } = await openPanel("basic.html");
  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await panel.getByRole("button", { name: "Keep" }).click();
  await expect(panel.getByText("Saved “Hide promoted posts”.")).toBeVisible();
  expect(Object.keys(await storedMods(worker))).toHaveLength(1);
  await site.reload();
  await expect(site.locator(".promoted")).toBeHidden();
});

test("single-page apps: mods follow pushState navigation", async ({ context, server, worker }) => {
  await seedMods(worker, [
    {
      ...HIDE_PROMOTED,
      matches: ["http://127.0.0.1/spa/feed*"],
      checks: [{ selector: ".post", expect: "exists" }],
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${server.origin}/spa/home`);
  await expect(page.getByText("Home banner")).toBeVisible(); // mod doesn't match /spa/home

  await page.getByRole("link", { name: "Feed" }).click();
  await expect(page).toHaveURL(/\/spa\/feed$/);
  await expect(page.getByText("Post", { exact: true })).toBeVisible();
  await expect(page.getByText("Sponsored post")).toBeHidden(); // re-applied without a page load

  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByText("Home banner")).toBeVisible(); // and removed again on the way out
  await page.goBack();
  await expect(page.getByText("Sponsored post")).toBeHidden();
});

test("the per-site kill switch pauses every mod on the site, live", async ({
  openPanel,
  worker,
}) => {
  await seedMods(worker, [HIDE_PROMOTED]);
  const { site, panel } = await openPanel("basic.html");
  await expect(site.locator(".promoted")).toBeHidden();
  await panel.getByRole("tab", { name: /^Mods/ }).click();
  await panel.getByRole("button", { name: "Pause mods on this site" }).click();
  await expect(panel.getByText("Mods are paused on this site.")).toBeVisible();
  await expect(site.locator(".promoted")).toBeVisible();
  await panel.getByRole("button", { name: "Resume mods on this site" }).click();
  await expect(site.locator(".promoted")).toBeHidden();
});
