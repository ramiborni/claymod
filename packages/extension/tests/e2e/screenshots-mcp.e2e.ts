import path from "node:path";
import type { Page } from "@playwright/test";
import { agentCall, expect, test } from "./bridge-fixtures";

// Agents (MCP, M5) screenshots: a real agent call through claymod-bridge, approved in the panel.
// Skipped unless SCREENSHOTS_DIR is set (see screenshots.e2e.ts).
const outDir = process.env.SCREENSHOTS_DIR;
test.skip(!outDir || process.platform === "win32", "Set SCREENSHOTS_DIR to capture screenshots.");
test.describe.configure({ mode: "serial", timeout: 90_000 });

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: path.join(outDir ?? "", `${name}.png`),
    animations: "disabled",
    fullPage: true,
  });

const draft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted so the feed only shows real posts.",
  matches: ["http://127.0.0.1/*"],
  css: ".post.promoted {\n  display: none !important;\n}",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};

for (const scheme of ["light", "dark"] as const) {
  test(`agents (${scheme})`, async ({ context, extensionId, home, server }) => {
    const prefix = `${scheme}-m5-`;
    const options = await context.newPage();
    await options.emulateMedia({ colorScheme: scheme });
    await options.setViewportSize({ width: 720, height: 900 });
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel("Let agents use Claymod (MCP)").check();
    await expect(options.getByTestId("agent-status")).toContainText("Agents can reach Claymod");
    await options.getByText("Add Claymod to your agent").click();
    await options.locator("#agents-heading").scrollIntoViewIfNeeded();
    await shot(options, `${prefix}1-settings-agents`);

    const panel = await context.newPage();
    await panel.emulateMedia({ colorScheme: scheme });
    await panel.setViewportSize({ width: 400, height: 640 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    const site = await context.newPage();
    await site.goto(`${server.origin}/fixtures/feed.html`);
    await site.bringToFront();

    const saving = agentCall(home, "save_mod", { mod: draft });
    await expect(panel.getByTestId("agent-request")).toBeVisible();
    await shot(panel, `${prefix}2-panel-agent-request`);
    await panel.getByTestId("agent-request").getByRole("button", { name: "Preview" }).click();
    await expect(panel.getByTestId("preview")).toContainText("Proposed by claymod-e2e");
    await shot(panel, `${prefix}3-panel-agent-preview`);
    await panel.getByTestId("preview").getByRole("button", { name: "Keep" }).click();
    await expect(panel.getByRole("status")).toContainText("Saved");
    await saving;
  });
}
