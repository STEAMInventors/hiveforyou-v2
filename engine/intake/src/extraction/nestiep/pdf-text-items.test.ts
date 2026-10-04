import { describe, expect, it } from "vitest";

import { joinPdfNativeItems } from "./pdf-text-items";

describe("joinPdfNativeItems", () => {
  it("merges kerning splits without a space", () => {
    const merged = joinPdfNativeItems([
      { text: "Ma", boundingBox: { x: 10, y: 100, width: 12, height: 10 } },
      { text: "ya", boundingBox: { x: 22, y: 100, width: 14, height: 10 } },
    ]);
    expect(merged.map((item) => item.text)).toEqual(["Maya"]);
  });

  it("inserts a space when horizontal gap is large", () => {
    const merged = joinPdfNativeItems([
      { text: "Score", boundingBox: { x: 10, y: 100, width: 40, height: 10 } },
      { text: "85", boundingBox: { x: 80, y: 100, width: 20, height: 10 } },
    ]);
    expect(merged[0]?.text).toBe("Score 85");
    expect(merged[0]?.text.split(/\s+/)).toEqual(["Score", "85"]);
  });

  it("joins the case 03 digit gap as 85 via between-item kerning", () => {
    const separate = joinPdfNativeItems([
      { text: "8", boundingBox: { x: 72, y: 680, width: 7.784, height: 14 } },
      { text: "5", boundingBox: { x: 82, y: 680, width: 7.784, height: 14 } },
    ]);
    expect(separate.map((item) => item.text)).toEqual(["85"]);
  });

  it("keeps a baked single-item digit space as 8 5", () => {
    const baked = joinPdfNativeItems([
      { text: "8 5", boundingBox: { x: 72, y: 680, width: 17.784, height: 14 } },
    ]);
    expect(baked.map((item) => item.text)).toEqual(["8 5"]);
  });

  it("keeps a true word-space gap as two tokens", () => {
    const merged = joinPdfNativeItems([
      { text: "Score", boundingBox: { x: 72, y: 700, width: 36, height: 14 } },
      { text: "85", boundingBox: { x: 72 + 36 + 8, y: 700, width: 16, height: 14 } },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text.split(/\s+/)).toEqual(["Score", "85"]);
  });

  it("joins Score plus separate kerning digits as Score 85", () => {
    const merged = joinPdfNativeItems([
      { text: "Score", boundingBox: { x: 72, y: 700, width: 36.568, height: 14 } },
      { text: "8", boundingBox: { x: 130, y: 700, width: 7.784, height: 14 } },
      { text: "5", boundingBox: { x: 140, y: 700, width: 7.784, height: 14 } },
    ]);
    expect(merged[0]?.text).toBe("Score 85");
  });

  it("keeps Score plus a baked digit item as Score 8 5", () => {
    const merged = joinPdfNativeItems([
      { text: "Score", boundingBox: { x: 72, y: 700, width: 36.568, height: 14 } },
      { text: "8 5", boundingBox: { x: 130, y: 700, width: 17.784, height: 14 } },
    ]);
    expect(merged[0]?.text).toBe("Score 8 5");
  });

  it("leaves multi-space digit items unchanged", () => {
    const merged = joinPdfNativeItems([
      {
        text: "3 4 5",
        boundingBox: { x: 72, y: 700, width: 40, height: 14 },
      },
    ]);
    expect(merged[0]?.text).toBe("3 4 5");
  });

  it("leaves spaced dates and phone numbers unchanged in one item", () => {
    const date = joinPdfNativeItems([
      { text: "11 12 2024", boundingBox: { x: 72, y: 700, width: 70.056, height: 14 } },
    ]);
    expect(date[0]?.text).toBe("11 12 2024");

    const phone = joinPdfNativeItems([
      { text: "706 555 1234", boundingBox: { x: 72, y: 680, width: 85.624, height: 14 } },
    ]);
    expect(phone[0]?.text).toBe("706 555 1234");
  });

  it("does not collapse letter runs with a baked space", () => {
    const merged = joinPdfNativeItems([
      { text: "a b", boundingBox: { x: 10, y: 100, width: 12, height: 10 } },
    ]);
    expect(merged[0]?.text).toBe("a b");
  });
});
