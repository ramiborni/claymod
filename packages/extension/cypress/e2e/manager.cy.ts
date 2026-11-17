import type { ManagerView, ModSummary } from "../../lib/rpc/protocol";
import { type FakeChromeOptions, installFakeChrome } from "../support/fake-chrome";

function mod(overrides: Partial<ModSummary> = {}): ModSummary {
  return {
    id: "a",
    name: "Hide promoted posts",
    description: "Hides promoted posts.",
    matches: ["https://example.com/*"],
    css: ".promoted { display: none }",
    version: 2,
    canUndo: true,
    enabled: true,
    jsApproved: true,
    health: "healthy",
    lastFailed: [],
    recentChecks: [true, true, true, true],
    appliesHere: true,
    hasAccess: true,
    ...overrides,
  };
}

function view(mods: ModSummary[], overrides: Partial<ManagerView> = {}): ManagerView {
  return {
    mods,
    site: { host: "example.com", paused: false },
    userScripts: {
      available: true,
      help: 'Open chrome://extensions/?id=x and turn on "Allow User Scripts".',
    },
    ...overrides,
  };
}

const ok = { ok: true as const, value: null };

function openMods(manager: ManagerView, options: FakeChromeOptions = {}) {
  cy.visit("/sidepanel.html", {
    onBeforeLoad: (win) =>
      installFakeChrome(win, {
        ...options,
        rpc: {
          status: { ok: true, value: { configured: true, label: "Anthropic · claude-opus-5-5" } },
          listMods: { ok: true, value: manager },
          setEnabled: ok,
          rename: ok,
          deleteMod: ok,
          undo: ok,
          approveJs: ok,
          setSitePaused: ok,
          ...options.rpc,
        },
      }),
  });
  cy.get("section[aria-label=Mods]").should("exist");
}

const openDetails = (name = "Hide promoted posts") => cy.contains("button.mod-name", name).click();

const callsTo = (method: string) =>
  cy.window().then((win) => win.fake.calls.filter((call) => call.method === method));

describe("mod manager", () => {
  it("shows this site's mods by default and every mod on request", () => {
    openMods(view([mod(), mod({ id: "b", name: "Dark mode", appliesHere: false })]));
    cy.get("[data-testid=mod]").should("have.length", 1).and("contain.text", "Hide promoted posts");
    cy.contains("button", "All sites").click();
    cy.get("[data-testid=mod]").should("have.length", 2);
  });

  it("explains an empty site", () => {
    openMods(view([]));
    cy.contains("No mods for this site yet. Describe a change above.");
    cy.contains("button", "Export all").should("be.disabled");
  });

  it("shows each mod's state on its row, and the details on request", () => {
    openMods(
      view([
        mod({ health: "needs-repair", version: 4, lastFailed: [".post"] }),
        mod({
          id: "b",
          name: "Dark mode",
          enabled: false,
          js: "x",
          jsApproved: false,
          hasAccess: false,
        }),
      ]),
    );
    cy.contains("[data-testid=mod]", "Hide promoted posts").should(
      "contain.text",
      "Stopped matching",
    );
    cy.contains("[data-testid=mod]", "Dark mode").should(
      "contain.text",
      "Off · JavaScript needs review · Needs site access",
    );
    cy.get(".counts").should("contain.text", "0 running").and("contain.text", "1 needs repair");
    openDetails();
    cy.contains("[data-testid=mod]", "Hide promoted posts")
      .should("contain.text", "v4")
      .and("contain.text", ".post not found");
  });

  it("shows the last visits as a strip", () => {
    openMods(view([mod({ recentChecks: [true, true, false] })]));
    cy.get(".strip").should("have.attr", "aria-label", "Last 3 visits: 2 passed, 1 failed");
    cy.get(".strip i").should("have.length", 10);
    cy.get(".strip i.x").should("have.length", 1);
    cy.get(".strip i.e").should("have.length", 7);
  });

  it("toggles a mod, renames it and asks before deleting", () => {
    openMods(view([mod()]));
    cy.contains("label", "Enabled").find("input").uncheck();
    callsTo("setEnabled").its("0.payload").should("deep.equal", { id: "a", enabled: false });
    openDetails();
    cy.contains("button", "Rename").click();
    cy.get("input[aria-label='New name']").clear().type("No ads");
    cy.contains("button", "Save").click();
    callsTo("rename").its("0.payload").should("deep.equal", { id: "a", name: "No ads" });
    cy.contains("button", "Delete").click();
    callsTo("deleteMod").should("have.length", 0);
    cy.contains("button", "Delete for good?").click();
    callsTo("deleteMod").its("0.payload").should("deep.equal", { id: "a" });
  });

  it("offers Undo only when there is a previous version", () => {
    openMods(view([mod({ canUndo: false })]));
    openDetails();
    cy.contains("button", "Rename").should("be.visible");
    cy.contains("button", "Undo").should("not.exist");
  });

  it("pauses every mod on the site", () => {
    openMods(view([mod()]));
    cy.contains("h2", "example.com");
    cy.get("button[aria-label='Pause mods on this site']")
      .should("have.text", "Pause site")
      .click();
    callsTo("setSitePaused")
      .its("0.payload")
      .should("deep.equal", { host: "example.com", paused: true });
  });

  it("only offers Enable JavaScript after the code was viewed", () => {
    openMods(view([mod({ js: "alert(1)", jsApproved: false })]));
    cy.contains("button", "Enable JavaScript").should("not.exist");
    openDetails();
    cy.contains("button", "View code").click();
    cy.get("[data-testid=code]").should("contain.text", "alert(1)");
    cy.contains("button", "Enable JavaScript").click();
    callsTo("approveJs").its("0.payload").should("deep.equal", { id: "a" });
  });

  it("explains how to enable user scripts when reviewed JS can't run", () => {
    openMods(
      view([mod({ js: "1" })], {
        userScripts: { available: false, help: 'turn on "Allow User Scripts"' },
      }),
    );
    cy.get("[data-testid=user-scripts-off]").should("contain.text", 'turn on "Allow User Scripts"');
  });

  it("asks for site access from the click", () => {
    openMods(view([mod({ hasAccess: false })]));
    openDetails();
    cy.contains(".notice", "can't run this mod until you allow it")
      .contains("button", "Allow")
      .click();
    cy.get("@permissionsRequest").should("have.been.calledWith", {
      origins: ["https://example.com/*"],
    });
  });

  it("repairs a broken mod through a preview", () => {
    const draft = {
      name: "Hide promoted posts",
      description: "Fixed.",
      matches: ["https://example.com/*"],
      css: ".ad{display:none}",
      runAt: "document_start",
      checks: [{ selector: ".feed", expect: "exists" }],
    };
    openMods(view([mod({ health: "needs-repair", lastFailed: [".post"] })]), {
      rpc: {
        repair: {
          ok: true,
          value: {
            generated: { draft, provider: "anthropic", model: "claude-opus-5-5" },
            preview: { css: true, js: "none" },
          },
        },
        saveRepair: { ok: true, value: { name: "Hide promoted posts", version: 3 } },
      },
    });
    cy.contains("[data-testid=mod] button", "Repair").click();
    cy.contains("Repaired version of “Hide promoted posts”");
    cy.contains("button", "Save repair").click();
    callsTo("saveRepair").its("0.payload").should("deep.include", { modId: "a", tabId: 7 });
    cy.contains(".notice.ok", "Repaired “Hide promoted posts” (now version 3).");
  });

  it("imports a file and reports skipped mods", () => {
    openMods(view([]), {
      rpc: {
        importMods: {
          ok: true,
          value: { imported: ["Dark mode"], errors: ["Mod 2: matches.0: nope"] },
        },
      },
    });
    cy.get("[data-testid=import-file]").selectFile(
      {
        contents: Cypress.Buffer.from('{"mods":[]}'),
        fileName: "mods.json",
        mimeType: "application/json",
      },
      { force: true },
    );
    cy.window().should((win) => {
      const call = win.fake.calls.find((c) => c.method === "importMods");
      expect(call?.payload).to.deep.equal({ text: '{"mods":[]}' });
    });
    cy.contains(
      ".notice.ok",
      "Imported 1 mod. Review any JavaScript before enabling it. Skipped 1: Mod 2: matches.0: nope",
    );
  });

  it("shows export errors", () => {
    openMods(view([mod()]), {
      rpc: { exportMods: { ok: false, error: "There are no mods to export yet." } },
    });
    cy.contains("button", "Export all").click();
    cy.contains("[role=alert]", "There are no mods to export yet.");
  });
});
