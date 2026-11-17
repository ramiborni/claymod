/**
 * Every starter mod in /mods is applied to a synthetic fixture page and must make its change.
 * The mods run on every site, so this uses a plain page: CSS as a style tag, JS evaluated.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test as base, chromium, type Page } from "@playwright/test";
import { type MockServer, startMockServer } from "./mock-server";

const modsDir = path.resolve(import.meta.dirname, "../../../../mods");

interface StarterMod {
  name: string;
  css?: string;
  js?: string;
}

const mods: Record<string, StarterMod> = Object.fromEntries(
  readdirSync(modsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file.replace(/\.json$/, ""),
      JSON.parse(readFileSync(path.join(modsDir, file), "utf8")),
    ]),
);

const test = base.extend<{ server: MockServer; page: Page }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require a destructuring pattern.
  server: async ({}, use) => {
    const server = await startMockServer();
    await use(server);
    await server.close();
  },
  page: async ({ server }, use) => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${server.origin}/fixtures/starter.html`);
    await use(page);
    await browser.close();
  },
});
const expect = test.expect;

async function apply(page: Page, slug: string) {
  const mod = mods[slug];
  if (!mod) throw new Error(`No starter mod ${slug}`);
  if (mod.css) await page.addStyleTag({ content: mod.css });
  if (mod.js) await page.evaluate(mod.js);
}

const style = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

test("there are ten starter mods", () => {
  expect(Object.keys(mods)).toHaveLength(10);
});

test("hide-cookie-banners hides common consent banners", async ({ page }) => {
  await apply(page, "hide-cookie-banners");
  for (const selector of ["#onetrust-banner-sdk", ".cc-window", ".cookie-banner"]) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await expect(page.locator("article")).toBeVisible();
});

test("comfortable-reading-width limits line length", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await page.locator("article p").boundingBox();
  await apply(page, "comfortable-reading-width");
  const after = await page.locator("article p").boundingBox();
  expect(after?.width ?? 0).toBeLessThan((before?.width ?? 0) * 0.75);
});

test("larger-text makes article text larger", async ({ page }) => {
  const before = Number.parseFloat(await style(page, "article p", "font-size"));
  await apply(page, "larger-text");
  expect(Number.parseFloat(await style(page, "article p", "font-size"))).toBeCloseTo(
    before * 1.125,
    1,
  );
});

test("underline-links underlines links in text only", async ({ page }) => {
  await apply(page, "underline-links");
  expect(await style(page, "p a", "text-decoration-line")).toBe("underline");
  expect(await style(page, "li a", "text-decoration-line")).toBe("underline");
  expect(await style(page, "#masthead a", "text-decoration-line")).toBe("none");
});

test("visible-focus outlines the focused element", async ({ page }) => {
  await apply(page, "visible-focus");
  await page.locator("#focus-me").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await style(page, "#focus-me", "outline-style")).toBe("solid");
  expect(await style(page, "#focus-me", "outline-width")).toBe("3px");
});

test("reduce-motion shortens animations to nothing", async ({ page }) => {
  await apply(page, "reduce-motion");
  expect(Number.parseFloat(await style(page, ".spinner", "animation-duration"))).toBeLessThan(
    0.001,
  );
});

test("hide-newsletter-popups hides the dialog but not the footer link", async ({ page }) => {
  await apply(page, "hide-newsletter-popups");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".newsletter-link")).toBeVisible();
});

test("hide-share-bars hides share buttons", async ({ page }) => {
  await apply(page, "hide-share-bars");
  await expect(page.locator(".share-bar")).toBeHidden();
  await expect(page.locator("article")).toBeVisible();
});

test("simple-dark-mode inverts the page but not images", async ({ page }) => {
  await apply(page, "simple-dark-mode");
  expect(await style(page, "html", "filter")).toContain("invert(1)");
  expect(await style(page, "img", "filter")).toContain("invert(1)");
});

test("stop-autoplay-video pauses autoplaying videos, including new ones", async ({ page }) => {
  await apply(page, "stop-autoplay-video");
  const first = page.locator("#autoplay-video");
  expect(await first.evaluate((v: HTMLVideoElement) => [v.autoplay, v.paused])).toEqual([
    false,
    true,
  ]);
  await page.evaluate(() => {
    const video = Object.assign(document.createElement("video"), {
      id: "late",
      autoplay: true,
      muted: true,
    });
    document.body.append(video);
  });
  await expect
    .poll(() => page.locator("#late").evaluate((v: HTMLVideoElement) => v.autoplay))
    .toBe(false);
});
