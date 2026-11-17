import { describe, expect, test } from "bun:test";
import { renderOutline } from "./outline";
import type { OutlineNode } from "./schema";
import { byteLength, TRUNCATION_MARKER, truncateToBytes } from "./truncate";

describe("truncateToBytes", () => {
  test("leaves short text alone", () => {
    expect(truncateToBytes("<p>hi</p>", 100)).toBe("<p>hi</p>");
  });

  test("cuts by UTF-8 bytes without splitting characters", () => {
    const text = "é".repeat(100) + "😀".repeat(50);
    const cut = truncateToBytes(text, 151);
    expect(cut.endsWith(TRUNCATION_MARKER)).toBe(true);
    const kept = cut.slice(0, -TRUNCATION_MARKER.length);
    expect(byteLength(kept)).toBeLessThanOrEqual(151);
    expect(kept).not.toContain("�");
    expect(() => encodeURIComponent(kept)).not.toThrow(); // throws on lone surrogates
  });
});

const page: OutlineNode = {
  tag: "BODY",
  children: [
    { tag: "header", id: "top", role: "banner", text: "  Example\n  site " },
    {
      tag: "main",
      classes: ["feed", "a", "b", "c", "d"],
      children: [{ tag: "article", classes: ["post"], text: "x".repeat(200) }],
    },
  ],
};

describe("renderOutline", () => {
  test("renders an indented, compact outline", () => {
    expect(renderOutline(page)).toBe(
      [
        "body",
        '  header#top [role=banner] "Example site"',
        "  main.feed.a.b.c",
        `    article.post "${"x".repeat(80)}…"`,
      ].join("\n"),
    );
  });

  test("stays under the byte cap and drops the deepest nodes first", () => {
    const wide: OutlineNode = {
      tag: "body",
      children: Array.from({ length: 2000 }, (_, i) => ({
        tag: "section",
        id: `s${i}`,
        children: [{ tag: "p", text: "deep detail" }],
      })),
    };
    const outline = renderOutline(wide, 30 * 1024);
    expect(byteLength(outline)).toBeLessThanOrEqual(30 * 1024);
    expect(outline).toEndWith("… (outline truncated to fit the size limit)");
    expect(outline).toContain("section#s0");
    expect(outline).not.toContain("deep detail");
  });
});
