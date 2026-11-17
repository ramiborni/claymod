import { defineConfig } from "cypress";

/**
 * Cypress tests the extension's UI pages (side panel, options) as plain web pages with a fake
 * extension API (cypress/support/fake-chrome.ts). Cypress can't open chrome-extension:// pages;
 * the real extension is covered end to end by Playwright (tests/e2e).
 * Run with `bun run cypress`, which builds the extension and serves .output/chrome-mv3.
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://127.0.0.1:4310",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 400,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
  },
});
