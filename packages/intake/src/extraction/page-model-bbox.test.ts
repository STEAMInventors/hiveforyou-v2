import { describe, expect, it } from "vitest";

import { legacyBBoxToPageModel, pageModelBBoxToLegacy } from "./page-model-bbox";

describe("page-model bbox adapter", () => {
  it("round-trips page-model bbox through legacy box", () => {
    const pageHeight = 792;
    const original: [number, number, number, number] = [72, 100, 180, 112];
    const legacy = pageModelBBoxToLegacy(original, pageHeight);
    const back = legacyBBoxToPageModel(legacy, pageHeight);
    expect(back[0]).toBeCloseTo(original[0], 5);
    expect(back[1]).toBeCloseTo(original[1], 5);
    expect(back[2]).toBeCloseTo(original[2], 5);
    expect(back[3]).toBeCloseTo(original[3], 5);
  });
});
