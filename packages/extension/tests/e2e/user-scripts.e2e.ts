import {
  enableUserScripts,
  expect,
  modState,
  seedMods,
  storedMods,
  test,
  useMockProvider,
} from "./fixtures";

const JS_MOD = {
  id: "8e7d6c5b-4a39-4281-9f0e-1d2c3b4a5f6e",
  name: "Add a banner",
  matches: ["http://127.0.0.1/*"],
  js: "document.body.prepend(Object.assign(document.createElement('p'), { id: 'mod-banner', textContent: 'Hello from a mod' }));",
  runAt: "document_idle" as const,
  checks: [{ selector: "body", expect: "exists" as const }],
};

const registeredUserScripts = (worker: import("@playwright/test").Worker) =>
  worker.evaluate(async () => (await chrome.userScripts.getScripts()).map((script) => script.id));

test("reviewed JavaScript runs as a user script on every visit; unreviewed doesn't", async ({
  context,
  extensionId,
  server,
  worker,
  openPanel,
}) => {
  await enableUserScripts(context, extensionId);
  await seedMods(worker, [{ ...JS_MOD, id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }], {
    jsApproved: false,
  });
  const { site, panel } = await openPanel("basic.html");
  await expect(site.locator("#content")).toBeVisible();
  await expect(site.locator("#mod-banner")).toHaveCount(0);
  expect(await registeredUserScripts(worker)).toEqual([]);

  const card = panel.getByTestId("mod");
  await panel.getByRole("tab", { name: "Mods" }).click();
  await card.getByRole("button", { name: "View code" }).click();
  await card.getByRole("button", { name: "Enable JavaScript" }).click();
  await expect
    .poll(() => registeredUserScripts(worker))
    .toEqual(["mod-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"]);

  const page = await context.newPage();
  await page.goto(`${server.origin}/fixtures/basic.html`);
  await expect(page.locator("#mod-banner")).toHaveText("Hello from a mod");
});

test("the panel explains how to turn user scripts on when JS mods can't run", async ({
  worker,
  openPanel,
}) => {
  await seedMods(worker, [JS_MOD], { jsApproved: true });
  const { panel } = await openPanel("basic.html");
  await panel.getByRole("tab", { name: "Mods" }).click();
  await expect(panel.getByTestId("user-scripts-off")).toContainText('turn on "Allow User Scripts"');
});

test("JavaScript is previewed in the user-script world and Discard reloads the page", async ({
  context,
  extensionId,
  server,
  worker,
  openPanel,
}) => {
  await enableUserScripts(context, extensionId);
  await useMockProvider(worker, server);
  const { id: _id, ...draft } = JS_MOD;
  server.model = {
    status: 200,
    content: JSON.stringify({ ...draft, description: "Adds a banner." }),
  };
  const { site, panel } = await openPanel("basic.html");
  await panel.getByLabel("What do you want to change?").fill("Add a banner");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(
    panel.getByText("This mod includes JavaScript. Discard reloads the page to undo it."),
  ).toBeVisible();
  await expect(site.locator("#mod-banner")).toHaveText("Hello from a mod");

  await panel.getByRole("button", { name: "Discard" }).click();
  await expect(site.locator("#mod-banner")).toHaveCount(0);
  expect(await storedMods(worker)).toEqual({});
});

test("keeping a previewed JS mod approves its JavaScript", async ({
  context,
  extensionId,
  server,
  worker,
  openPanel,
}) => {
  await enableUserScripts(context, extensionId);
  await useMockProvider(worker, server);
  const { id: _id, ...draft } = JS_MOD;
  server.model = {
    status: 200,
    content: JSON.stringify({ ...draft, description: "Adds a banner." }),
  };
  const { panel } = await openPanel("basic.html");
  await panel.getByLabel("What do you want to change?").fill("Add a banner");
  await panel.getByRole("button", { name: "Generate" }).click();
  await panel.getByRole("button", { name: "Keep" }).click();
  await expect(panel.getByText("Saved “Add a banner”.")).toBeVisible();
  const [id] = Object.keys(await storedMods(worker));
  expect(await modState(worker, id ?? "")).toMatchObject({ jsApproved: true });
});
