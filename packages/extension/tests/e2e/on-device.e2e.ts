import { expect, test } from "./fixtures";

const MODEL = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";

test("the side panel never starts a model download by surprise", async ({ openPanel, worker }) => {
  await worker.evaluate(async (model) => {
    await chrome.storage.local.set({ providerConfig: { kind: "on-device", model } });
  }, MODEL);
  const { panel } = await openPanel("basic.html");
  await expect(panel.getByTestId("provider")).toHaveText("Qwen2.5 Coder 1.5B (on this device)");
  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Download Qwen2.5 Coder 1.5B first: open Claymod settings, choose On-device and click Download.",
  );
});

test("settings report what this machine's GPU can do", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel("Provider").selectOption("on-device");
  const summary = page.getByTestId("gpu-summary");
  await expect(summary).not.toHaveText("Checking your GPU…");
  const webgpu = await page.evaluate(async () =>
    Boolean(
      await (
        navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }
      ).gpu?.requestAdapter(),
    ),
  );
  test.info().annotations.push({ type: "webgpu", description: String(webgpu) });
  if (webgpu) await expect(summary).toContainText("usable");
  else await expect(summary).toContainText("Choose another provider");
});
