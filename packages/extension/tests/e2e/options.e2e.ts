import { createServer } from "node:net";
import { expect, test } from "./fixtures";

const portIsFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });

test("configure a provider, test the connection and save", async ({
  page,
  extensionId,
  server,
  worker,
}) => {
  server.model = { status: 200, content: "OK" };
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel("Provider").selectOption("openai-compatible");
  await page.getByLabel("Base URL").fill(`${server.origin}/v1`);
  await page.getByLabel("Model").fill("mock-model");

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByTestId("status")).toHaveText("Connected. mock-model answered.");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("status")).toHaveText("Saved.");
  const stored = await worker.evaluate(
    async () => (await chrome.storage.local.get("providerConfig")).providerConfig,
  );
  expect(stored).toEqual({
    kind: "openai-compatible",
    baseUrl: `${server.origin}/v1`,
    model: "mock-model",
    responseFormat: "json_object",
  });
});

test("an unreachable Ollama explains OLLAMA_ORIGINS with this extension's real ID", async ({
  page,
  extensionId,
}) => {
  test.skip(!(await portIsFree(11434)), "Something is listening on Ollama's port on this machine.");
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel("Base URL").fill("http://localhost:11434/v1");
  await page.getByLabel("Model").fill("llama3.1:8b");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByTestId("status")).toContainText(
    `set OLLAMA_ORIGINS=chrome-extension://${extensionId} and restart Ollama.`,
    { timeout: 30_000 },
  );
});

test("Anthropic settings show only the fields that apply and validate the key", async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel("Provider").selectOption("anthropic");
  await expect(page.getByLabel("Model")).toHaveValue("claude-opus-5-5");
  await expect(page.getByLabel("JSON mode")).toBeHidden();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("status")).toHaveText("Enter your Anthropic API key.");
});
