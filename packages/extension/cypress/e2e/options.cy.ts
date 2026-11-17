import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

function openOptions(options: FakeChromeOptions = {}) {
  cy.visit("/options.html", { onBeforeLoad: (win) => installFakeChrome(win, options) });
}

describe("options page", () => {
  it("defaults to a local Ollama server", () => {
    openOptions();
    cy.get("select[name=kind]").should("have.value", "openai-compatible");
    cy.get("input[name=baseUrl]").should("have.value", "http://localhost:11434/v1");
    cy.contains("label", "JSON mode").should("be.visible");
  });

  it("shows saved settings", () => {
    openOptions({
      storage: {
        providerConfig: { kind: "anthropic", apiKey: "sk-ant-x", model: "claude-sonnet-5-5" },
      },
    });
    cy.get("select[name=kind]").should("have.value", "anthropic");
    cy.get("input[name=model]").should("have.value", "claude-sonnet-5-5");
    cy.get("input[name=apiKey]")
      .should("have.value", "sk-ant-x")
      .and("have.attr", "type", "password");
  });

  it("switching to Anthropic shows only its fields", () => {
    openOptions();
    cy.get("select[name=kind]").select("anthropic");
    cy.get("input[name=model]").should("have.value", "claude-opus-5-5");
    cy.contains("label", "JSON mode").should("not.be.visible");
    cy.contains("Claymod uses API keys only, never a claude.ai login.").should("be.visible");
    cy.get("input[name=structuredOutput]").should("be.checked");
  });

  it("validates before saving and says which field to fix", () => {
    openOptions();
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("have.text", "Enter the model name, like llama3.1:8b.");
    cy.window().its("fake.stored").should("not.have.property", "providerConfig");
  });

  it("saves a valid config", () => {
    openOptions();
    cy.get("input[name=model]").type("qwen3:8b");
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("have.text", "Saved.");
    cy.window()
      .its("fake.stored.providerConfig")
      .should("deep.equal", {
        v: 2,
        config: {
          kind: "openai-compatible",
          baseUrl: "http://localhost:11434/v1",
          model: "qwen3:8b",
          responseFormat: "json_object",
        },
      });
  });

  it("tests the connection and shows the result", () => {
    openOptions({ rpc: { testConnection: { ok: true, value: { model: "qwen3:8b" } } } });
    cy.get("input[name=model]").type("qwen3:8b");
    cy.contains("button", "Test connection").click();
    cy.get("[data-testid=status]").should("have.text", "Connected. qwen3:8b answered.");
  });

  it("shows the fix when Ollama blocks the extension", () => {
    const error =
      "Ollama blocked the extension. Set OLLAMA_ORIGINS=chrome-extension://fakeextensionid and restart Ollama.";
    openOptions({ rpc: { testConnection: { ok: false, error } } });
    cy.get("input[name=model]").type("llama3.1:8b");
    cy.contains("button", "Test connection").click();
    cy.get("[data-testid=status]").should("have.class", "error").and("have.text", error);
  });

  it("shows and hides the API key", () => {
    openOptions();
    cy.get("input[name=apiKey]").type("secret").should("have.attr", "type", "password");
    cy.contains("button", "Show").click();
    cy.get("input[name=apiKey]").should("have.attr", "type", "text");
    cy.contains("button", "Hide").click();
    cy.get("input[name=apiKey]").should("have.attr", "type", "password");
  });

  it("stores API keys encrypted, never as plain text", () => {
    openOptions();
    cy.get("select[name=kind]").select("anthropic");
    cy.get("input[name=apiKey]").type("sk-ant-secret");
    cy.contains("button", "Save").click();
    cy.get("[data-testid=status]").should("have.text", "Saved.");
    cy.window()
      .its("fake.stored.providerConfig")
      .then((stored) => {
        expect(JSON.stringify(stored)).not.to.contain("sk-ant-secret");
        expect(stored).to.have.nested.property("apiKey.iv");
        expect(stored).to.have.nested.property("config.kind", "anthropic");
      });
    // Reloading decrypts the key for the form.
    cy.window().then((win) => {
      const stored = win.fake.stored;
      cy.visit("/options.html", {
        onBeforeLoad: (next) => installFakeChrome(next, { storage: stored }),
      });
    });
    cy.get("input[name=apiKey]").should("have.value", "sk-ant-secret");
  });
});
