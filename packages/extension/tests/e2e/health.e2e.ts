import { expect, modState, seedMods, storedMods, test, useMockProvider } from "./fixtures";

const OLD_MOD = {
  id: "3f2e1d0c-9b8a-4765-8432-10fedcba9876",
  name: "Hide promoted posts",
  matches: ["http://127.0.0.1/*"],
  css: ".post.promoted { display: none !important; }",
  checks: [{ selector: ".post", expect: "exists" as const }],
};

const REPAIRED = {
  name: "Hide promoted posts",
  description: "Hides sponsored entries after the redesign.",
  matches: ["http://127.0.0.1/*"],
  css: ".entry.sponsored { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".entry", expect: "exists" }],
};

test("a changed site triggers needs repair; Repair saves v2 and Undo restores v1", async ({
  openPanel,
  server,
  worker,
}) => {
  test.slow(); // three real visits, each waiting for the page to settle
  await useMockProvider(worker, server);
  await seedMods(worker, [OLD_MOD]);
  const { site, panel, tabId } = await openPanel("feed-v2.html");

  // Visits 2 and 3 (the panel opened visit 1). One failing visit isn't enough on its own.
  for (let visit = 1; visit <= 3; visit++) {
    await expect
      .poll(
        async () =>
          ((await modState(worker, OLD_MOD.id))?.checkRuns as unknown[] | undefined)?.length ?? 0,
        {
          timeout: 15_000,
        },
      )
      .toBe(visit);
    if (visit < 3) await site.reload();
  }
  expect(await modState(worker, OLD_MOD.id)).toMatchObject({ health: "needs-repair" });
  await expect
    .poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId))
    .toBe("!");

  await panel.getByRole("tab", { name: /Mods \(1 needs repair\)/ }).click();
  const card = panel.getByTestId("mod");
  await expect(card.getByText("Needs repair")).toBeVisible();
  await expect(card).toContainText(".post not found");

  server.model = { status: 200, content: JSON.stringify(REPAIRED) };
  await card.getByRole("button", { name: "Repair" }).click();
  await expect(panel.getByText("Repaired version of “Hide promoted posts”")).toBeVisible();
  await expect(site.locator(".entry.sponsored")).toBeHidden(); // previewed
  const prompt =
    server.requests
      .at(-1)
      ?.messages.map((m) => m.content)
      .join("\n") ?? "";
  expect(prompt).toContain("Checks that no longer match:\n- .post");
  expect(prompt).toContain('section.entry.sponsored "Sponsored post"');

  await panel.getByRole("button", { name: "Save repair" }).click();
  await expect(panel.getByText("Repaired “Hide promoted posts” (now version 2).")).toBeVisible();
  const repaired = Object.values(await storedMods(worker))[0];
  expect(repaired).toMatchObject({
    version: 2,
    css: REPAIRED.css,
    history: [{ version: 1, css: OLD_MOD.css }],
  });
  expect(await modState(worker, OLD_MOD.id)).toMatchObject({ health: "healthy", checkRuns: [] });

  await panel.getByRole("tab", { name: "Mods" }).click();
  await panel.getByTestId("mod").getByRole("button", { name: "Undo" }).click();
  await expect(panel.getByTestId("mod").getByText("v1")).toBeVisible();
  expect(Object.values(await storedMods(worker))[0]).toMatchObject({
    version: 1,
    css: OLD_MOD.css,
    history: [],
  });
});
