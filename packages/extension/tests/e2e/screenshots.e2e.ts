import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, useMockProvider } from "./fixtures";

// Captures the UI for docs and reviews. Skipped unless SCREENSHOTS_DIR is set:
//   SCREENSHOTS_DIR=/tmp/shots bun run --cwd packages/extension screenshots
const outDir = process.env.SCREENSHOTS_DIR;
test.skip(!outDir, "Set SCREENSHOTS_DIR to capture screenshots.");
test.describe.configure({ mode: "serial", timeout: 90_000 });

const draft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted so the feed only shows real posts.",
  matches: ["http://127.0.0.1/*"],
  css: ".post.promoted {\n  display: none !important;\n}",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(outDir ?? "", `${name}.png`), animations: "disabled" });

/** Site and panel side by side, roughly as they appear in Chrome. */
async function composite(site: Page, panel: Page, name: string) {
  const [left, right] = await Promise.all([site.screenshot(), panel.screenshot()]);
  const canvas = await site.context().newPage();
  await canvas.setViewportSize({ width: 1300, height: 640 });
  const image = (data: Buffer) => `<img src="data:image/png;base64,${data.toString("base64")}">`;
  await canvas.setContent(
    `<body style="margin:0;display:flex;background:#888">
      <div style="width:900px;height:640px;overflow:hidden">${image(left).replace("<img", '<img style="width:900px"')}</div>
      <div style="width:400px;border-left:1px solid #555">${image(right).replace("<img", '<img style="width:400px"')}</div>
    </body>`,
  );
  await shot(canvas, name);
  await canvas.close();
}

for (const scheme of ["light", "dark"] as const) {
  test(`side panel and site (${scheme})`, async ({ openPanel, server, worker }) => {
    await useMockProvider(worker, server);
    server.model = { status: 200, content: JSON.stringify(draft), delayMs: 1500 };
    const { site, panel } = await openPanel("feed.html");
    for (const page of [site, panel]) await page.emulateMedia({ colorScheme: scheme });
    await panel.setViewportSize({ width: 400, height: 640 });
    await site.setViewportSize({ width: 900, height: 640 });
    const prefix = `${scheme}-`;

    await expect(panel.getByTestId("provider")).toContainText("mock-model");
    await panel
      .getByLabel("What do you want to change?")
      .fill("Hide the promoted posts in the feed");
    await shot(panel, `${prefix}1-panel-compose`);

    await panel.getByRole("button", { name: "Pick element" }).click();
    await expect(panel.getByText("Click an element on the page")).toBeVisible();
    await site.locator(".post.promoted").first().hover();
    await shot(panel, `${prefix}2-panel-picking`);
    await shot(site, `${prefix}3-site-picking`);
    await composite(site, panel, `${prefix}0-together-picking`);
    await site.locator(".post.promoted").first().click();
    await expect(panel.getByTestId("picked")).toBeVisible();
    await shot(panel, `${prefix}4-panel-picked`);

    await panel.getByRole("button", { name: "Generate" }).click();
    await expect(panel.getByText("Writing your mod…")).toBeVisible();
    await shot(panel, `${prefix}5-panel-generating`);

    await expect(panel.getByTestId("preview")).toBeVisible();
    await panel.getByRole("button", { name: "View code" }).click();
    await shot(panel, `${prefix}6-panel-preview`);
    await shot(site, `${prefix}7-site-preview`);
    await composite(site, panel, `${prefix}0-together-preview`);

    await panel.getByRole("button", { name: "Keep" }).click();
    await expect(panel.getByText("Saved")).toBeVisible();
    await shot(panel, `${prefix}8-panel-saved`);

    server.model = {
      status: 401,
      content: JSON.stringify({ error: { message: "Invalid API key." } }),
    };
    await panel.getByRole("button", { name: "Make another change" }).click();
    await panel.getByLabel("What do you want to change?").fill("Make the header sticky");
    await panel.getByRole("button", { name: "Generate" }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await shot(panel, `${prefix}9-panel-error`);
  });

  test(`options page (${scheme})`, async ({ page, extensionId, server }) => {
    server.model = { status: 200, content: "OK" };
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 720, height: 820 });
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByLabel("Base URL").fill(`${server.origin}/v1`);
    await page.getByLabel(/^Model/).fill("llama3.1:8b");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByTestId("status")).toContainText("Connected.");
    await shot(page, `${scheme}-10-options`);
  });
}
