import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, seedMods, test, useMockProvider } from "./fixtures";

// M3 screens: the mod manager, JS review, repair. Skipped unless SCREENSHOTS_DIR is set.
const outDir = process.env.SCREENSHOTS_DIR;
test.skip(!outDir, "Set SCREENSHOTS_DIR to capture screenshots.");
test.describe.configure({ mode: "serial", timeout: 90_000 });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(outDir ?? "", `${name}.png`), animations: "disabled" });

const BROKEN = "2b3c4d5e-6f70-4182-9a3b-4c5d6e7f8091";
const IMPORTED = "3c4d5e6f-7081-4293-8b4c-5d6e7f809102";

const mods = [
  {
    id: "1a2b3c4d-5e6f-4071-8a2b-3c4d5e6f7080",
    name: "Hide promoted posts",
    matches: ["http://127.0.0.1/*"],
    css: ".post.promoted { display: none !important; }",
    checks: [{ selector: ".post", expect: "exists" as const }],
  },
  {
    id: BROKEN,
    name: "Bigger headlines",
    matches: ["http://127.0.0.1/*"],
    css: ".headline { font-size: 22px; }",
    checks: [{ selector: ".headline", expect: "exists" as const }],
  },
  {
    id: IMPORTED,
    name: "Reading time badge",
    matches: ["http://127.0.0.1/*"],
    js: "for (const post of document.querySelectorAll('.post')) {\n  const words = post.textContent.split(/\\s+/).length;\n  post.dataset.readingTime = Math.ceil(words / 200) + ' min';\n}",
    runAt: "document_idle" as const,
    checks: [{ selector: ".post", expect: "exists" as const }],
  },
];

for (const scheme of ["light", "dark"] as const) {
  test(`mod manager (${scheme})`, async ({ openPanel, server, worker }) => {
    await useMockProvider(worker, server);
    await seedMods(worker, mods);
    await worker.evaluate(
      async ({ broken, imported }) => {
        const { modState } = await chrome.storage.local.get("modState");
        const state = modState as Record<string, Record<string, unknown>>;
        const runs = [1, 2, 3].map((i) => ({
          at: `2026-11-17T0${i}:00:00.000Z`,
          failedSelectors: [".headline"],
        }));
        state[broken] = { ...state[broken], checkRuns: runs, health: "needs-repair" };
        state[imported] = { ...state[imported], jsApproved: false };
        await chrome.storage.local.set({ modState: state });
      },
      { broken: BROKEN, imported: IMPORTED },
    );
    const { site, panel } = await openPanel("feed.html");
    for (const page of [site, panel]) await page.emulateMedia({ colorScheme: scheme });
    await panel.setViewportSize({ width: 400, height: 900 });
    const prefix = `${scheme}-m3-`;

    await panel.getByRole("tab", { name: /^Mods/ }).click();
    await expect(panel.getByTestId("mod")).toHaveCount(3);
    await shot(panel, `${prefix}1-manager`);

    const imported = panel.getByTestId("mod").filter({ hasText: "Reading time badge" });
    await imported.getByRole("button", { name: "View code" }).click();
    await expect(imported.getByRole("button", { name: "Enable JavaScript" })).toBeVisible();
    await imported.scrollIntoViewIfNeeded();
    await shot(panel, `${prefix}2-js-review`);
    await imported.getByRole("button", { name: "Hide code" }).click();

    server.model = {
      status: 200,
      delayMs: 800,
      content: JSON.stringify({
        name: "Bigger headlines",
        description: "Makes post titles larger after the site renamed its headline class.",
        matches: ["http://127.0.0.1/*"],
        css: ".post h2 { font-size: 22px; }",
        runAt: "document_start",
        checks: [{ selector: ".post h2", expect: "exists" }],
      }),
    };
    await panel
      .getByTestId("mod")
      .filter({ hasText: "Bigger headlines" })
      .getByRole("button", { name: "Repair" })
      .click();
    await expect(panel.getByText("Repairing “Bigger headlines”…")).toBeVisible();
    await shot(panel, `${prefix}3-repairing`);
    await expect(panel.getByText("Repaired version of “Bigger headlines”")).toBeVisible();
    await panel.getByRole("button", { name: "View code" }).click();
    await shot(panel, `${prefix}4-repair-preview`);
    await panel.getByRole("button", { name: "Save repair" }).click();
    await expect(panel.getByText("now version 2")).toBeVisible();
    await shot(panel, `${prefix}5-repaired`);

    await panel.getByRole("tab", { name: /^Mods/ }).click();
    await panel.getByRole("button", { name: "Pause mods on this site" }).click();
    await expect(panel.getByText("Mods are paused on this site.")).toBeVisible();
    await shot(panel, `${prefix}6-site-paused`);
  });
}
