import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

const draft = {
  name: "Hide promoted posts",
  description: "Hides posts marked as promoted.",
  matches: ["https://example.com/*"],
  css: ".post.promoted { display: none !important; }",
  runAt: "document_start",
  checks: [{ selector: ".post", expect: "exists" }],
};
const generated = { draft, provider: "openai-compatible", model: "llama3.1:8b" };
const configured = {
  ok: true as const,
  value: { configured: true, label: "localhost:11434 · llama3.1:8b" },
};

function openPanel(options: FakeChromeOptions = {}) {
  cy.visit("/sidepanel.html", {
    onBeforeLoad: (win) =>
      installFakeChrome(win, {
        ...options,
        rpc: {
          status: configured,
          generate: { ok: true, value: generated },
          preview: { ok: true, value: { css: true, js: "none" } },
          keep: { ok: true, value: { id: "1", name: draft.name } },
          discard: { ok: true, value: null },
          ...options.rpc,
        },
      }),
  });
}

const calls = (method: string) =>
  cy.window().then((win) => win.fake.calls.filter((call) => call.method === method));

describe("side panel", () => {
  it("asks for a provider before anything else", () => {
    openPanel({ rpc: { status: { ok: true, value: { configured: false, label: "" } } } });
    cy.contains(".notice", "Choose a model provider to start.");
    cy.findGenerate().should("be.disabled");
    cy.contains("button", "Open settings").click();
    cy.get("@openOptionsPage").should("have.been.calledOnce");
  });

  it("enables Generate once there is a request", () => {
    openPanel();
    cy.get("[data-testid=provider]").should("have.text", "localhost:11434 · llama3.1:8b");
    cy.findGenerate().should("be.disabled");
    cy.get("#request").type("Hide promoted posts");
    cy.findGenerate().should("be.enabled");
  });

  it("picks an element, generates, previews and keeps", () => {
    const picked = { selector: "article.post.promoted", outerHTML: "<article>…</article>" };
    openPanel({ hold: ["pick", "generate"], rpc: { pick: { ok: true, value: picked } } });
    cy.get("#request").type("Hide promoted posts");

    cy.contains("button", "Pick element").click();
    cy.contains("Click an element on the page. Press Esc to cancel.");
    cy.window().then((win) => win.fake.release("pick"));
    cy.get("[data-testid=picked]").should("contain.text", "article.post.promoted");

    cy.findGenerate().click();
    cy.contains("[role=status]", "Writing your mod…");
    cy.window().then((win) => win.fake.release("generate"));

    cy.get("[data-testid=preview]").within(() => {
      cy.contains("h2", "Hide promoted posts");
      cy.contains("li", "https://example.com/*");
      cy.contains("button", "View code").click();
    });
    cy.get("[data-testid=code]").should(
      "contain.text",
      ".post.promoted { display: none !important; }",
    );
    calls("generate")
      .its("0.payload")
      .should("deep.include", { tabId: 7, request: "Hide promoted posts", pickedElement: picked });
    calls("preview").its("0.payload.draft.name").should("eq", draft.name);

    cy.contains("button", "Keep").click();
    cy.get("@permissionsRequest").should("have.been.calledWith", {
      origins: ["https://example.com/*"],
    });
    cy.contains(".notice.ok", "Saved “Hide promoted posts”.");
    calls("keep").its("0.payload.generated.model").should("eq", "llama3.1:8b");
    cy.contains("button", "Make another change").click();
    cy.get("#request").should("have.value", "");
  });

  it("doesn't save when site access is refused", () => {
    openPanel({ permissionGranted: false });
    cy.get("#request").type("Hide promoted posts");
    cy.findGenerate().click();
    cy.contains("button", "Keep").click();
    cy.contains("[role=alert]", "Access wasn't granted, so the mod wasn't saved.");
    calls("keep").should("have.length", 0);
    cy.contains("button", "Keep").should("be.enabled");
  });

  it("discards the preview", () => {
    openPanel();
    cy.get("#request").type("x");
    cy.findGenerate().click();
    cy.contains("button", "Discard").click();
    calls("discard").its("0.payload").should("deep.equal", { tabId: 7 });
    cy.findGenerate().should("be.visible");
  });

  it("warns about mods that run everywhere and JS that wasn't previewed", () => {
    const jsHelp =
      'To run JavaScript mods, open chrome://extensions/?id=x and turn on "Allow User Scripts", then try again.';
    openPanel({
      rpc: {
        generate: {
          ok: true,
          value: { ...generated, draft: { ...draft, matches: ["<all_urls>"], js: "1" } },
        },
        preview: { ok: true, value: { css: true, js: "unavailable", jsHelp } },
      },
    });
    cy.get("#request").type("x");
    cy.findGenerate().click();
    cy.contains(".notice.warn", "This mod asks to run on every website.");
    cy.contains(".notice.warn", "Allow User Scripts");
  });

  it("shows provider errors and goes back", () => {
    const error = "The model server rejected the API key. Check the key in Claymod's settings.";
    openPanel({ rpc: { generate: { ok: false, error } } });
    cy.get("#request").type("x");
    cy.findGenerate().click();
    cy.contains("[role=alert]", error);
    cy.contains("button", "Back").click();
    cy.get("#request").should("have.value", "x");
  });

  it("cancels a running generation", () => {
    openPanel({ hold: ["generate"], rpc: { generate: { ok: false, error: "Cancelled." } } });
    cy.get("#request").type("x");
    cy.findGenerate().click();
    cy.contains("button", "Cancel").click();
    cy.window().its("fake.cancelled").should("have.length", 1);
    cy.window().then((win) => win.fake.release("generate"));
    cy.findGenerate().should("be.visible");
  });
});
