declare global {
  namespace Cypress {
    interface Chainable {
      findGenerate(): Chainable<JQuery<HTMLButtonElement>>;
    }
  }
}

Cypress.Commands.add("findGenerate", () => cy.contains<HTMLButtonElement>("button", "Generate"));

export {};
