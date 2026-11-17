import { describe, expect, test } from "bun:test";
import { isBroadPattern, originsForMatches } from "./origins";

describe("originsForMatches", () => {
  test("keeps site patterns and expands <all_urls>", () => {
    expect(originsForMatches(["https://example.com/*", "https://example.com/*"])).toEqual([
      "https://example.com/*",
    ]);
    expect(originsForMatches(["<all_urls>"])).toEqual(["http://*/*", "https://*/*"]);
  });
});

describe("isBroadPattern", () => {
  test.each([
    ["<all_urls>", true],
    ["*://*/*", true],
    ["https://*/*", true],
    ["https://*.example.com/*", false],
    ["https://example.com/*", false],
  ])("%s → %p", (pattern, broad) => expect(isBroadPattern(pattern)).toBe(broad));
});
