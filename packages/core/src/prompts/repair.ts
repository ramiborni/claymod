import type { Mod } from "../mod/schema";
import type { Snapshot } from "../snapshot/schema";
import { type PromptBudget, renderSnapshot } from "./snapshot";
import { buildSystemPrompt } from "./system";
import type { Prompt } from "./types";

export interface RepairPromptInput {
  mod: Mod;
  snapshot: Snapshot;
  /** Check selectors that no longer match on the page. */
  failedSelectors: string[];
  budget?: PromptBudget | undefined;
}

function currentDraft(mod: Mod) {
  const { name, description, matches, css, js, runAt, checks } = mod;
  return { name, description, matches, css, js, runAt, checks };
}

export function buildRepairPrompt({
  mod,
  snapshot,
  failedSelectors,
  budget,
}: RepairPromptInput): Prompt {
  const failed = failedSelectors.length
    ? failedSelectors.map((selector) => `- ${selector}`).join("\n")
    : "- (none reported; the mod no longer has the intended effect)";
  const content = [
    `This mod stopped working because the website changed:\n<current_mod>\n${JSON.stringify(currentDraft(mod), null, 2)}\n</current_mod>`,
    `Checks that no longer match:\n${failed}`,
    renderSnapshot(snapshot, budget),
    "Repair the mod so it makes the same change on the page as it is now. Keep the name and intent; update selectors, code and checks. Answer with the JSON object only.",
  ].join("\n\n");
  return { system: buildSystemPrompt(), messages: [{ role: "user", content }] };
}
