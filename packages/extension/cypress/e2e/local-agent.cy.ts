import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

function openOptions(options: FakeChromeOptions = {}) {
  cy.visit("/options.html", { onBeforeLoad: (win) => installFakeChrome(win, options) });
}

function chooseLocalAgent() {
  cy.get("select[name=kind]").select("local-agent");
}

describe("options: local agent", () => {
  it("shows the agent fields and the setup command with this extension's ID", () => {
    openOptions();
    chooseLocalAgent();
    cy.get("select[name=agent]").should("have.value", "claude-code");
    cy.get("select[name=auth]").should("have.value", "cli");
    cy.contains("label", "Base URL").should("not.be.visible");
    cy.contains("label", /^API key/).should("not.be.visible");
    cy.contains("never sees your login or tokens").should("be.visible");
    cy.get("[data-testid=sign-in-risk]").should("not.be.visible");
    cy.contains("summary", "Set up claymod-bridge").click();
    cy.get("[data-testid=install-command]").should(
      "have.text",
      "claymod-bridge install --extension-id fakeextensionid",
    );
  });

  it("saves Claude Code with its own sign-in after Chrome allows local apps", () => {
    openOptions();
    chooseLocalAgent();
    cy.get("input[name=model]").type("opus");
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("have.text", "Saved.");
    cy.get("@permissionsRequest").should("have.been.calledWith", {
      permissions: ["nativeMessaging"],
    });
    cy.window()
      .its("fake.stored.providerConfig")
      .should("deep.equal", {
        v: 2,
        config: { kind: "local-agent", agent: "claude-code", auth: "cli", model: "opus" },
      });
  });

  it("doesn't save when Chrome's permission is refused", () => {
    openOptions({ permissionGranted: false });
    chooseLocalAgent();
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]")
      .should("have.class", "error")
      .and("contain.text", "permission to talk to local apps");
    cy.window().its("fake.stored").should("not.have.property", "providerConfig");
  });

  it("Google CLIs default to an API key and warn before using their sign-in", () => {
    openOptions();
    chooseLocalAgent();
    cy.get("select[name=agent]").select("gemini");
    cy.get("select[name=auth]").should("have.value", "api-key");
    cy.get("[data-testid=sign-in-risk]").should("not.be.visible");
    cy.get("input[name=agentKey]").should("be.visible");

    cy.get("select[name=auth]").select("cli");
    cy.get("[data-testid=sign-in-risk]")
      .should("be.visible")
      .and("contain.text", "Your Google account could be suspended");
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("contain.text", "I understand the risk");
    cy.window().its("fake.stored").should("not.have.property", "providerConfig");

    cy.contains("label", "I understand the risk").find("input").check();
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("have.text", "Saved.");
    cy.window()
      .its("fake.stored.providerConfig.config")
      .should("deep.equal", { kind: "local-agent", agent: "gemini", auth: "cli" });
  });

  it("sends an agent key to the keychain and keeps no copy", () => {
    openOptions({ rpc: { bridgeSetKey: { ok: true, value: null } } });
    chooseLocalAgent();
    cy.get("select[name=agent]").select("codex");
    cy.get("select[name=auth]").select("api-key");
    cy.get("input[name=agentKey]").type("sk-codex-secret");
    cy.contains("button", "Store in keychain").click();
    cy.get("[data-testid=status]").should("contain.text", "Saved in your system keychain");
    cy.get("input[name=agentKey]").should("have.value", "");
    cy.window()
      .its("fake.calls")
      .should("deep.include", {
        method: "bridgeSetKey",
        payload: { agent: "codex", key: "sk-codex-secret" },
      });
    cy.contains("button", "Save").click();
    cy.window().then((win) => {
      expect(JSON.stringify(win.fake.stored)).not.to.contain("sk-codex-secret");
    });
  });

  it("asks for the key before saving it to the keychain", () => {
    openOptions();
    chooseLocalAgent();
    cy.get("select[name=auth]").select("api-key");
    cy.contains("button", "Store in keychain").click();
    cy.get("[data-testid=status]").should("have.text", "Paste the agent's API key first.");
  });

  it("tests the connection through the bridge", () => {
    openOptions({
      rpc: { testConnection: { ok: true, value: { model: "claude-opus-5-5" } } },
      hold: ["testConnection"],
    });
    chooseLocalAgent();
    cy.contains("button", "Test connection").click();
    cy.get("[data-testid=status]").should("contain.text", "can take up to a minute");
    cy.window().then((win) => win.fake.release("testConnection"));
    cy.get("[data-testid=status]").should("have.text", "Connected. claude-opus-5-5 answered.");
    cy.window()
      .its("fake.calls")
      .should("deep.include", {
        method: "testConnection",
        payload: { config: { kind: "local-agent", agent: "claude-code", auth: "cli" } },
      });
  });

  it("shows the install step when the bridge is missing", () => {
    const error =
      "claymod-bridge isn't set up for this browser. Install it, then run in a terminal: claymod-bridge install --extension-id fakeextensionid";
    openOptions({ rpc: { testConnection: { ok: false, error } } });
    chooseLocalAgent();
    cy.contains("button", "Test connection").click();
    cy.get("[data-testid=status]").should("have.class", "error").and("have.text", error);
    cy.get("#bridge-setup").should("have.attr", "open");
    cy.get("[data-testid=install-command]").should("be.visible");
  });

  it("clears the model when switching agents", () => {
    openOptions();
    chooseLocalAgent();
    cy.get("input[name=model]").type("opus");
    cy.get("select[name=agent]").select("codex");
    cy.get("input[name=model]").should("have.value", "");
  });

  it("shows a saved local agent", () => {
    openOptions({
      storage: {
        providerConfig: {
          v: 2,
          config: { kind: "local-agent", agent: "antigravity", auth: "cli", model: "gemini-pro" },
        },
      },
    });
    cy.get("select[name=kind]").should("have.value", "local-agent");
    cy.get("select[name=agent]").should("have.value", "antigravity");
    cy.get("input[name=model]").should("have.value", "gemini-pro");
    cy.get("input[name=riskAccepted]").should("be.checked");
  });
});
