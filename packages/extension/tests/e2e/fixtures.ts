import path from "node:path";
import { type BrowserContext, test as base, chromium } from "@playwright/test";

export const extensionPath = path.resolve(import.meta.dirname, "../../.output/chrome-mv3");

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      // The "chromium" channel runs extensions in new headless mode.
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;
    await use(extensionId);
  },
});

export const expect = test.expect;
