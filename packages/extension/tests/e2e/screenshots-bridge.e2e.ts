import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./bridge-fixtures";

// Local agent (M4) screenshots, captured against the real bridge and a fake agent CLI.
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
  test(`local agent settings and panel (${scheme})`, async ({
    context,
    extensionId,
    agents,
    server,
  }) => {
    writeFileSync(path.join(agents, "draft.json"), JSON.stringify(draft));
    const prefix = `${scheme}-m4-`;
    const options = await context.newPage();
    await options.emulateMedia({ colorScheme: scheme });
    await options.setViewportSize({ width: 720, height: 900 });
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel("Provider").selectOption("local-agent");
    await options.getByText("Set up claymod-bridge").click();
    await options.getByLabel(/^Model/).fill("claude-opus-5-5");
    await options.getByRole("button", { name: "Test connection" }).click();
    await expect(options.getByTestId("status")).toHaveText("Connected. claude-fake-1 answered.");
    await shot(options, `${prefix}1-local-agent-connected`);
    await options.getByRole("button", { name: "Save", exact: true }).click();

    await options.locator("select[name=agent]").selectOption("codex");
    await options.locator("select[name=auth]").selectOption("api-key");
    await options.locator("input[name=agentKey]").fill("sk-example");
    await shot(options, `${prefix}2-agent-api-key`);

    await options.locator("select[name=agent]").selectOption("gemini");
    await options.locator("select[name=auth]").selectOption("cli");
    await expect(options.getByTestId("sign-in-risk")).toBeVisible();
    await shot(options, `${prefix}3-google-sign-in-warning`);
    await options.close();

    const site = await context.newPage();
    const url = `${server.origin}/fixtures/feed.html`;
    await site.goto(url);
    const tabId = await context
      .serviceWorkers()[0]
      ?.evaluate(async (target) => (await chrome.tabs.query({ url: target }))[0]?.id ?? -1, url);
    const panel = await context.newPage();
    await panel.emulateMedia({ colorScheme: scheme });
    await panel.setViewportSize({ width: 400, height: 640 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
    await panel
      .getByLabel("What do you want to change?")
      .fill("Hide the promoted posts in the feed");
    await panel.getByRole("button", { name: "Generate" }).click();
    await expect(
      panel.getByTestId("preview").getByRole("heading", { name: draft.name }),
    ).toBeVisible();
    await shot(panel, `${prefix}4-panel-preview-local-agent`);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`bridge not installed (${scheme})`, async ({ context, extensionId, home }) => {
    rmSync(path.join(home, "profile/NativeMessagingHosts"), { recursive: true, force: true });
    const options = await context.newPage();
    await options.emulateMedia({ colorScheme: scheme });
    await options.setViewportSize({ width: 720, height: 900 });
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.getByLabel("Provider").selectOption("local-agent");
    await options.getByRole("button", { name: "Test connection" }).click();
    await expect(options.getByTestId("status")).toContainText("claymod-bridge install");
    await shot(options, `${scheme}-m4-5-bridge-missing`);
  });
}
