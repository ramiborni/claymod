import { describe, expect, test } from "bun:test";
import { makeLibrary, makeMod } from "./fixtures";
import { contentScriptMatches, hostOf, modsForUrl, userScriptRegistrations } from "./selection";

const css = makeMod();
const js = makeMod({
  id: "9b8a2c1d-0e7f-4a6b-8c5d-3e2f1a0b9c8d",
  js: "console.log(1)",
  css: undefined,
  matches: ["*://*.news.test/*"],
  runAt: "document_idle",
});

describe("modsForUrl", () => {
  test("returns enabled mods whose patterns match", () => {
    const library = makeLibrary([css, js]);
    expect(modsForUrl(library, "https://example.com/feed").map((m) => m.id)).toEqual([css.id]);
    expect(modsForUrl(library, "https://www.news.test/a").map((m) => m.id)).toEqual([js.id]);
    expect(modsForUrl(library, "https://other.test/")).toEqual([]);
  });

  test("skips disabled mods and paused sites", () => {
    const library = makeLibrary([css]);
    library.pausedSites = ["example.com"];
    expect(modsForUrl(library, "https://example.com/")).toEqual([]);
    library.pausedSites = [];
    const state = library.state[css.id];
    if (state) state.enabled = false;
    expect(modsForUrl(library, "https://example.com/")).toEqual([]);
  });
});

describe("registrations", () => {
  test("content script covers every enabled mod's patterns once", () => {
    expect(contentScriptMatches(makeLibrary([css, js, css]))).toEqual([
      "*://*.news.test/*",
      "https://example.com/*",
    ]);
  });

  test("only reviewed JS becomes a user script, excluding paused sites", () => {
    expect(userScriptRegistrations(makeLibrary([css, js], false))).toEqual([]);
    const library = makeLibrary([css, js], true);
    library.pausedSites = ["www.news.test"];
    expect(userScriptRegistrations(library)).toEqual([
      {
        id: `mod-${js.id}`,
        matches: ["*://*.news.test/*"],
        excludeMatches: ["*://www.news.test/*"],
        js: [{ code: "console.log(1)" }],
        runAt: "document_idle",
        world: "USER_SCRIPT",
      },
    ]);
  });
});

test("hostOf ignores non-web URLs", () => {
  expect(hostOf("https://a.example.com/x")).toBe("a.example.com");
  expect(hostOf("chrome://extensions")).toBeUndefined();
  expect(hostOf("nope")).toBeUndefined();
});
