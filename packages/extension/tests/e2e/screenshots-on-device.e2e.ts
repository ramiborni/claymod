import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// On-device (M6) settings screenshots. Headless Chrome has no WebGPU adapter, so a fake one
// (a dedicated GPU, then an integrated one) is installed before the page loads.
const outDir = process.env.SCREENSHOTS_DIR;
test.skip(!outDir, "Set SCREENSHOTS_DIR to capture screenshots.");
test.describe.configure({ mode: "serial" });

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: path.join(outDir ?? "", `${name}.png`),
    animations: "disabled",
    fullPage: true,
  });

async function fakeGpu(page: Page, vendor: string, description: string) {
  await page.addInitScript(
    ([v, d]) => {
      const adapter = {
        features: { has: (name: string) => name === "shader-f16" },
        info: { vendor: v, architecture: "", description: d, isFallbackAdapter: false },
      };
      Object.defineProperty(navigator, "gpu", { value: { requestAdapter: async () => adapter } });
      Object.defineProperty(navigator, "deviceMemory", { value: 8 });
    },
    [vendor, description],
  );
}

for (const scheme of ["light", "dark"] as const) {
  test(`on-device settings (${scheme})`, async ({ page, extensionId }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 720, height: 900 });
    await fakeGpu(page, "nvidia", "");
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.getByLabel("Provider").selectOption("on-device");
    await expect(page.getByTestId("gpu-summary")).toContainText("Dedicated GPU");
    await shot(page, `${scheme}-m6-1-on-device-dedicated`);

    const integrated = await page.context().newPage();
    await integrated.emulateMedia({ colorScheme: scheme });
    await integrated.setViewportSize({ width: 720, height: 900 });
    await fakeGpu(integrated, "intel", "Intel(R) Iris(R) Xe Graphics");
    await integrated.goto(`chrome-extension://${extensionId}/options.html`);
    await integrated.getByLabel("Provider").selectOption("on-device");
    await integrated
      .locator("select[name=onDeviceModel]")
      .selectOption("Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC");
    await expect(integrated.getByTestId("on-device-state")).toContainText(
      "may slow your other apps",
    );
    await shot(integrated, `${scheme}-m6-2-on-device-integrated-heavy`);
  });
}
