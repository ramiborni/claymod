/**
 * The whole local-agent path with nothing faked but the agent (see bridge-fixtures.ts).
 */
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { calls, expect, extensionPath, test, unpackedExtensionId } from "./bridge-fixtures";

test.skip(process.platform === "win32", "The fake agent is a shell script.");

test("a local agent creates a mod through claymod-bridge", async ({
  context,
  extensionId,
  agents,
  server,
}) => {
  expect(extensionId).toBe(unpackedExtensionId(extensionPath));
  writeFileSync(
    path.join(agents, "draft.json"),
    JSON.stringify({
      name: "Hide promoted posts (agent)",
      description: "Hides promoted posts.",
      matches: ["http://127.0.0.1/*"],
      css: ".post.promoted { display: none !important; }",
      runAt: "document_start",
      checks: [{ selector: ".post", expect: "exists" }],
    }),
  );

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Provider").selectOption("local-agent");
  await options.getByRole("button", { name: "Test connection" }).click();
  await expect(options.getByTestId("status")).toHaveText("Connected. claude-fake-1 answered.", {
    timeout: 20_000,
  });
  await options.getByRole("button", { name: "Save", exact: true }).click();
  await expect(options.getByTestId("status")).toHaveText("Saved.");

  const site = await context.newPage();
  const url = `${server.origin}/fixtures/basic.html`;
  await site.goto(url);
  const worker = context.serviceWorkers()[0];
  const tabId = await worker?.evaluate(
    async (target) => (await chrome.tabs.query({ url: target }))[0]?.id ?? -1,
    url,
  );
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
  await expect(panel.getByTestId("provider")).toHaveText(/Claude Code.*\(local\)/);

  await panel.getByLabel("What do you want to change?").fill("Hide promoted posts");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(
    panel.getByTestId("preview").getByRole("heading", { name: "Hide promoted posts (agent)" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(site.locator(".post.promoted")).toBeHidden();

  const generate = calls(agents).at(-1);
  expect(generate?.args).toContain("--json-schema");
  expect(generate?.stdin).toContain("<user_request>\nHide promoted posts");
  expect(generate?.env.LANGSMITH_TRACING).toBeNull();
});

test("without the bridge registered, settings say how to install it", async ({
  context,
  extensionId,
  home,
}) => {
  rmSync(path.join(home, "profile/NativeMessagingHosts"), {
    recursive: true,
    force: true,
  });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Provider").selectOption("local-agent");
  await options.getByRole("button", { name: "Test connection" }).click();
  await expect(options.getByTestId("status")).toContainText(
    `claymod-bridge install --extension-id ${extensionId}`,
  );
});
