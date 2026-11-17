import { describe, expect, test } from "bun:test";
import { hostOfMatchPattern, isValidMatchPattern, matchesUrl } from "./match-pattern";

describe("isValidMatchPattern", () => {
  test.each([
    "https://example.com/*",
    "*://*.example.com/*",
    "http://localhost:8080/app/*",
    "https://*/*",
    "<all_urls>",
  ])("accepts %s", (pattern) => expect(isValidMatchPattern(pattern)).toBe(true));

  test.each([
    "example.com",
    "https://example.com",
    "file:///tmp/*",
    "chrome-extension://abc/*",
    "https://exa*mple.com/*",
    "https://*example.com/*",
    "",
  ])("rejects %s", (pattern) => expect(isValidMatchPattern(pattern)).toBe(false));
});

describe("hostOfMatchPattern", () => {
  test("returns the host for per-site permissions", () => {
    expect(hostOfMatchPattern("https://*.example.com/news/*")).toBe("*.example.com");
  });

  test("returns undefined for <all_urls> and invalid patterns", () => {
    expect(hostOfMatchPattern("<all_urls>")).toBeUndefined();
    expect(hostOfMatchPattern("nope")).toBeUndefined();
  });
});

describe("matchesUrl", () => {
  test.each([
    ["https://example.com/*", "https://example.com/feed?x=1", true],
    ["https://example.com/*", "http://example.com/", false],
    ["*://example.com/*", "http://example.com/", true],
    ["*://*.example.com/*", "https://example.com/", true],
    ["*://*.example.com/*", "https://a.b.example.com/x", true],
    ["*://*.example.com/*", "https://notexample.com/", false],
    ["http://127.0.0.1/*", "http://127.0.0.1:4310/x", true],
    ["http://127.0.0.1:8080/*", "http://127.0.0.1:4310/x", false],
    ["https://example.com/feed*", "https://example.com/feed/today", true],
    ["https://example.com/feed*", "https://example.com/home", false],
    ["https://example.com/a*b", "https://example.com/a/x/b", true],
    ["https://example.com/search?q=*", "https://example.com/search?q=cats", true],
    ["<all_urls>", "https://anything.test/", true],
    ["<all_urls>", "chrome://extensions/", false],
    ["https://example.com/*", "not a url", false],
  ])("%s vs %s → %p", (pattern, url, expected) => expect(matchesUrl(pattern, url)).toBe(expected));
});
