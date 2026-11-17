import path from "node:path";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from "@playwright/test";
import { type MockServer, startMockServer } from "./mock-server";

export const extensionPath = path.resolve(import.meta.dirname, "../../.output/chrome-mv3-e2e");

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  server: MockServer;
  /** Opens a fixture page and the side panel UI targeting it. */
  openPanel: (fixture: string) => Promise<{ site: Page; panel: Page; tabId: number }>;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      // The "chromium" channel runs extensions in new headless mode.
      channel: "chromium",
      // Sharper images when capturing screenshots for people (bun run screenshots).
      deviceScaleFactor: process.env.SCREENSHOTS_DIR ? 2 : 1,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    await use(context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  server: async ({}, use) => {
    const server = await startMockServer();
    await use(server);
    await server.close();
  },
  openPanel: async ({ context, worker, extensionId, server }, use) => {
    await use(async (fixture) => {
      const site = await context.newPage();
      const url = `${server.origin}/fixtures/${fixture}`;
      await site.goto(url);
      const tabId = await worker.evaluate(async (target) => {
        const [tab] = await chrome.tabs.query({ url: target });
        return tab?.id ?? -1;
      }, url);
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
      return { site, panel, tabId };
    });
  },
});

export const expect = test.expect;

/** Points Claymod at the mock server's fake model. */
export async function useMockProvider(worker: Worker, server: MockServer): Promise<void> {
  await worker.evaluate(async (baseUrl) => {
    await chrome.storage.local.set({
      providerConfig: { kind: "openai-compatible", baseUrl, model: "mock-model" },
    });
  }, `${server.origin}/v1`);
}

export async function storedMods(worker: Worker): Promise<Record<string, Record<string, unknown>>> {
  const stored = await worker.evaluate(() => chrome.storage.local.get("mods"));
  return (stored.mods ?? {}) as Record<string, Record<string, unknown>>;
}
