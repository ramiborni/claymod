import { describe, expect, test } from "bun:test";
import { hostOfMatchPattern, isValidMatchPattern } from "./match-pattern";

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
