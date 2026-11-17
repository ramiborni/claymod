import { describe, expect, test } from "bun:test";
import { mod, snapshot } from "../../tests/fixtures";
import { buildCreatePrompt } from "./create";
import { buildRepairPrompt } from "./repair";
import { withRetryFeedback } from "./retry";

describe("buildCreatePrompt", () => {
  const prompt = buildCreatePrompt({ request: "  Hide promoted posts  ", snapshot });
  const [message] = prompt.messages;

  test("system prompt states the rules and embeds the draft JSON Schema", () => {
    expect(prompt.system).toContain("Prefer CSS");
    expect(prompt.system).toContain("untrusted data");
    expect(prompt.system).toContain('"additionalProperties":false');
    expect(prompt.system).not.toContain('"history"');
  });

  test("user message holds the delimited snapshot and the trimmed request", () => {
    expect(prompt.messages).toHaveLength(1);
    expect(message?.role).toBe("user");
    expect(message?.content).toContain("<page_snapshot>\nURL: https://example.com/feed");
    expect(message?.content).toContain("selector: article.post.promoted");
    expect(message?.content).toContain("<user_request>\nHide promoted posts\n</user_request>");
  });

  test("snapshot comes before the request so page text can't pose as the last word", () => {
    const content = message?.content ?? "";
    expect(content.indexOf("</page_snapshot>")).toBeLessThan(content.indexOf("<user_request>"));
  });

  test("works without a picked element", () => {
    const { pickedElement: _picked, ...rest } = snapshot;
    const content = buildCreatePrompt({ request: "x", snapshot: rest }).messages[0]?.content;
    expect(content).not.toContain("Element the user picked");
  });
});

describe("buildRepairPrompt", () => {
  test("includes the current mod, the failed checks and the new snapshot", () => {
    const prompt = buildRepairPrompt({ mod, snapshot, failedSelectors: [".post"] });
    const content = prompt.messages[0]?.content ?? "";
    expect(content).toContain('"name": "Hide promoted posts"');
    expect(content).toContain("- .post");
    expect(content).toContain("<page_snapshot>");
    expect(content).not.toContain(mod.id);
    expect(content).not.toContain('"history"');
  });

  test("says so when no selector failed", () => {
    const prompt = buildRepairPrompt({ mod, snapshot, failedSelectors: [] });
    expect(prompt.messages[0]?.content).toContain("none reported");
  });
});

describe("withRetryFeedback", () => {
  test("appends the bad answer and the errors, ending on a user turn", () => {
    const base = buildCreatePrompt({ request: "x", snapshot });
    const retry = withRetryFeedback(base, "{bad}", ["matches.0: nope"]);
    expect(retry.system).toBe(base.system);
    expect(retry.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry.messages[1]?.content).toBe("{bad}");
    expect(retry.messages[2]?.content).toContain("- matches.0: nope");
  });
});
