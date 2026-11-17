import { expect, storedMods, test, useMockProvider } from "./fixtures";

const draft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted.",
  matches: ["http://127.0.0.1/*"],
  css: ".post.promoted { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};

test.beforeEach(async ({ worker, server }) => {
  await useMockProvider(worker, server);
  server.model = { status: 200, content: JSON.stringify(draft) };
});

test("create a mod: pick, generate, preview, view code, keep", async ({
  openPanel,
  server,
  worker,
}) => {
  const { site, panel } = await openPanel("basic.html");
  await expect(panel.getByTestId("provider")).toHaveText(/127\.0\.0\.1.*mock-model/);

  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Pick element" }).click();
  await expect(panel.getByText("Click an element on the page")).toBeVisible();
  await site.locator(".post.promoted").click();
  await expect(panel.getByTestId("picked")).toContainText("promoted");

  await panel.getByRole("button", { name: "Generate" }).click();
  const preview = panel.getByTestId("preview");
  await expect(preview.getByRole("heading", { name: "Hide promoted posts" })).toBeVisible();
  await expect(site.locator(".post.promoted")).toBeHidden();
  await expect(site.locator(".post").first()).toBeVisible();

  // The model saw the request, the picked element and the page outline.
  const prompt =
    server.requests
      .at(-1)
      ?.messages.map((m) => m.content)
      .join("\n") ?? "";
  expect(prompt).toContain("<user_request>\nHide promoted posts");
  expect(prompt).toContain("Element the user picked (selector: ");
  expect(prompt).toContain('article.post.promoted "Promoted post"');

  await preview.getByRole("button", { name: "View code" }).click();
  await expect(panel.getByTestId("code")).toContainText(
    ".post.promoted { display: none !important; }",
  );

  await preview.getByRole("button", { name: "Keep" }).click();
  await expect(panel.getByText("Saved “Hide promoted posts”.")).toBeVisible();

  const mods = Object.values(await storedMods(worker));
  expect(mods).toHaveLength(1);
  expect(mods[0]).toMatchObject({
    schemaVersion: 1,
    ...draft,
    version: 1,
    createdBy: { provider: "openai-compatible", model: "mock-model" },
    history: [],
  });
});

test("discard fully reverts the preview and saves nothing", async ({ openPanel, worker }) => {
  const { site, panel } = await openPanel("basic.html");
  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(site.locator(".post.promoted")).toBeHidden();

  await panel.getByRole("button", { name: "Discard" }).click();
  await expect(panel.getByRole("button", { name: "Generate" })).toBeVisible();
  await expect(site.locator(".post.promoted")).toBeVisible();
  expect(await storedMods(worker)).toEqual({});
});

test("Esc cancels the picker", async ({ openPanel }) => {
  const { site, panel } = await openPanel("basic.html");
  await panel.getByRole("button", { name: "Pick element" }).click();
  await expect(panel.getByText("Click an element on the page")).toBeVisible();
  await site.locator("body").hover();
  await site.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "Pick element" })).toBeVisible();
  await expect(panel.getByTestId("picked")).toHaveCount(0);
});

test("an invalid answer is retried once with the errors", async ({ openPanel, server }) => {
  const { panel } = await openPanel("basic.html");
  server.model = { status: 200, content: JSON.stringify({ ...draft, matches: ["127.0.0.1"] }) };
  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "didn't produce a valid mod after two tries",
  );
  expect(server.requests).toHaveLength(2);
  expect(server.requests[1]?.messages.at(-1)?.content).toContain(
    "matches.0: Not a valid Chrome match pattern",
  );
});

test("provider errors tell the user what to do", async ({ openPanel, server }) => {
  const { panel } = await openPanel("basic.html");
  server.model = {
    status: 401,
    content: JSON.stringify({ error: { message: "Invalid API key." } }),
  };
  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "rejected the API key. Check the key in Claymod's settings.",
  );
});
