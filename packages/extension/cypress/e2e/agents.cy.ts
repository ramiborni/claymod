import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

const draft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted.",
  matches: ["https://example.com/*"],
  css: ".post.promoted { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};
const request = (overrides: Record<string, unknown> = {}) => ({
  id: "req-1",
  tool: "preview_mod",
  client: "claude-code",
  draft,
  tabId: 7,
  createdAt: "2026-11-17T10:00:00.000Z",
  ...overrides,
});

function openPanel(requests: unknown[], options: FakeChromeOptions = {}) {
  cy.visit("/sidepanel.html", {
    onBeforeLoad: (win) =>
      installFakeChrome(win, {
        ...options,
        rpc: {
          status: { ok: true, value: { configured: true, label: "Claude Code (local)" } },
          agentRequests: { ok: true, value: requests },
          agentDecision: { ok: true, value: null },
          preview: { ok: true, value: { css: true, js: "none" } },
          keep: { ok: true, value: { id: "new-id", name: draft.name } },
          saveRepair: { ok: true, value: { name: "Old mod", version: 3 } },
          discard: { ok: true, value: null },
          ...options.rpc,
        },
      }),
  });
}

const calls = (method: string) =>
  cy.window().then((win) => win.fake.calls.filter((call) => call.method === method));

describe("side panel: agent requests (MCP)", () => {
  it("shows what the agent asks for", () => {
    openPanel([request()]);
    cy.get("[data-testid=agent-request]")
      .should("contain.text", "claude-code wants to preview a mod")
      .and("contain.text", draft.name)
      .and("contain.text", "Runs on: https://example.com/*");
  });

  it("previewing tells the agent and shows the normal preview", () => {
    openPanel([request()]);
    cy.contains("[data-testid=agent-request] button", "Preview").click();
    cy.get("[data-testid=preview]").should("contain.text", "Proposed by claude-code");
    cy.get("[data-testid=agent-request]").should("not.exist");
    calls("preview").should("deep.equal", [{ method: "preview", payload: { tabId: 7, draft } }]);
    calls("agentDecision").should("deep.equal", [
      { method: "agentDecision", payload: { requestId: "req-1", outcome: { kind: "previewed" } } },
    ]);
  });

  it("declining answers the agent", () => {
    openPanel([request()]);
    cy.contains("[data-testid=agent-request] button", "Decline").click();
    calls("agentDecision").should("deep.equal", [
      { method: "agentDecision", payload: { requestId: "req-1", outcome: { kind: "declined" } } },
    ]);
  });

  it("keeping a save request asks for site access and reports the saved mod", () => {
    openPanel([request({ tool: "save_mod" })]);
    cy.contains("[data-testid=agent-request] button", "Preview").click();
    cy.contains("[data-testid=preview] button", "Keep").click();
    cy.get("@permissionsRequest").should("have.been.calledWith", {
      origins: ["https://example.com/*"],
    });
    cy.contains("Saved “Hide promoted posts”.");
    calls("agentDecision").should("deep.equal", [
      {
        method: "agentDecision",
        payload: {
          requestId: "req-1",
          outcome: { kind: "saved", id: "new-id", name: draft.name, version: 1 },
        },
      },
    ]);
    calls("keep").its("0.payload.generated.provider").should("equal", "mcp:claude-code");
  });

  it("discarding a save request tells the agent", () => {
    openPanel([request({ tool: "save_mod" })]);
    cy.contains("[data-testid=agent-request] button", "Preview").click();
    cy.contains("[data-testid=preview] button", "Discard").click();
    calls("agentDecision").its("0.payload.outcome").should("deep.equal", { kind: "discarded" });
  });

  it("an update saves a new version of the existing mod", () => {
    openPanel([request({ tool: "save_mod", replaces: { id: "old-id", name: "Old mod" } })]);
    cy.get("[data-testid=agent-request]").should("contain.text", "wants to update “Old mod”");
    cy.contains("[data-testid=agent-request] button", "Preview").click();
    cy.get("[data-testid=preview]").should("contain.text", "new version of “Old mod”");
    cy.contains("[data-testid=preview] button", "Save new version").click();
    calls("saveRepair").its("0.payload.modId").should("equal", "old-id");
    cy.contains("Updated “Old mod” (now version 3).");
    calls("agentDecision")
      .its("0.payload.outcome")
      .should("deep.equal", { kind: "saved", id: "old-id", name: "Old mod", version: 3 });
  });

  it("keeps the request when the preview fails", () => {
    openPanel([request()], {
      rpc: { preview: { ok: false, error: "Claymod can't access this page yet." } },
    });
    cy.contains("[data-testid=agent-request] button", "Preview").click();
    cy.get("[role=alert]").should("contain.text", "can't access this page");
    calls("agentDecision").should("have.length", 0);
  });
});

function openOptions(options: FakeChromeOptions = {}) {
  cy.visit("/options.html", { onBeforeLoad: (win) => installFakeChrome(win, options) });
}

describe("options: agents (MCP)", () => {
  it("is off by default and explains what it does", () => {
    openOptions({ rpc: { agentAccess: { ok: true, value: { enabled: false, state: "off" } } } });
    cy.get("#agent-access").should("not.be.checked");
    cy.contains("You approve every preview and save");
    cy.get("[data-testid=agent-status]").should("not.be.visible");
  });

  it("turning it on asks Chrome first, then connects", () => {
    openOptions({
      rpc: {
        agentAccess: { ok: true, value: { enabled: false, state: "off" } },
        setAgentAccess: { ok: true, value: { enabled: true, state: "connected" } },
      },
    });
    cy.get("#agent-access").check();
    cy.get("@permissionsRequest").should("have.been.calledWith", {
      permissions: ["nativeMessaging"],
    });
    cy.get("[data-testid=agent-status]")
      .should("have.class", "ok")
      .and("contain.text", "Agents can reach Claymod");
    calls("setAgentAccess").its("0.payload").should("deep.equal", { enabled: true });
  });

  it("stays off when Chrome's permission is refused", () => {
    openOptions({
      permissionGranted: false,
      rpc: { agentAccess: { ok: true, value: { enabled: false, state: "off" } } },
    });
    cy.get("#agent-access").check();
    cy.get("#agent-access").should("not.be.checked");
    calls("setAgentAccess").should("have.length", 0);
  });

  it("shows bridge problems with the setup steps open", () => {
    const error =
      "claymod-bridge isn't set up for this browser. Install it, then run in a terminal: claymod-bridge install --extension-id fakeextensionid";
    openOptions({
      rpc: { agentAccess: { ok: true, value: { enabled: true, state: "error", error } } },
    });
    cy.get("#agent-access").should("be.checked");
    cy.get("[data-testid=agent-status]").should("have.class", "error").and("have.text", error);
    cy.get("#agent-setup").should("have.attr", "open");
    cy.contains("code", "claude mcp add claymod -- claymod-bridge mcp").should("be.visible");
  });
});
