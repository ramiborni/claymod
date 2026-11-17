/**
 * M5 end to end: an agent (an MCP client starting `claymod-bridge mcp`) reads the page, asks
 * for a preview and a save, and the user approves both in the real side panel. Nothing is faked
 * except the agent itself.
 */
import type { Page } from "@playwright/test";
import { agentCall, expect, test } from "./bridge-fixtures";

const draft = {
  name: "Hide promoted posts (agent)",
  description: "Hides promoted posts.",
  matches: ["http://127.0.0.1/*"],
  css: ".post.promoted { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};

async function approve(panel: Page, button: "Keep" | null) {
  const card = panel.getByTestId("agent-request");
  await expect(card).toContainText("claymod-e2e wants to");
  await card.getByRole("button", { name: "Preview" }).click();
  await expect(panel.getByTestId("preview")).toContainText("Proposed by claymod-e2e");
  if (button) await panel.getByTestId("preview").getByRole("button", { name: button }).click();
}

test.skip(process.platform === "win32", "The bridge fixtures use shell scripts.");
// Several real processes (Chromium, the bridge host, one MCP server per call) under a full suite.
test.describe.configure({ timeout: 60_000 });

test("an agent reads the page, previews and saves a mod the user approves", async ({
  context,
  extensionId,
  home,
  server,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Let agents use Claymod (MCP)").check();
  await expect(options.getByTestId("agent-status")).toContainText("Agents can reach Claymod");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const site = await context.newPage();
  await site.goto(`${server.origin}/fixtures/basic.html`);
  await site.bringToFront();

  const page = await agentCall(home, "get_active_page", {});
  expect(page.isError).toBe(false);
  expect(page.text).toContain("Claymod fixture: basic");
  expect(page.text).toContain('article.post.promoted "Promoted post"');

  const invalid = await agentCall(home, "preview_mod", { mod: { name: "x" } });
  expect(invalid.isError).toBe(true);
  expect(invalid.text).toContain("The mod isn't valid");

  const previewing = agentCall(home, "preview_mod", { mod: draft });
  await approve(panel, null);
  await expect(site.locator(".post.promoted")).toBeHidden();
  expect(JSON.parse((await previewing).text)).toMatchObject({ status: "previewed" });

  await panel.getByTestId("preview").getByRole("button", { name: "Discard" }).click();
  const saving = agentCall(home, "save_mod", { mod: draft });
  await approve(panel, "Keep");
  const saved = JSON.parse((await saving).text);
  expect(saved).toMatchObject({ status: "saved", name: draft.name, version: 1 });

  const listed = JSON.parse((await agentCall(home, "list_mods", { site: "127.0.0.1" })).text);
  expect(listed.mods).toEqual([
    expect.objectContaining({ id: saved.id, enabled: true, health: "healthy" }),
  ]);
  const status = JSON.parse((await agentCall(home, "get_mod_status", { id: saved.id })).text);
  expect(status.createdBy).toEqual({ provider: "mcp:claymod-e2e", model: "agent" });
});

test("agents get a clear answer when the user declines", async ({
  context,
  extensionId,
  home,
  server,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Let agents use Claymod (MCP)").check();
  await expect(options.getByTestId("agent-status")).toContainText("Agents can reach Claymod");
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const site = await context.newPage();
  await site.goto(`${server.origin}/fixtures/basic.html`);
  await site.bringToFront();

  const asking = agentCall(home, "save_mod", { mod: draft });
  await panel.getByTestId("agent-request").getByRole("button", { name: "Decline" }).click();
  expect(JSON.parse((await asking).text)).toEqual({ status: "declined" });
  await expect(panel.getByTestId("agent-request")).toHaveCount(0);
});
