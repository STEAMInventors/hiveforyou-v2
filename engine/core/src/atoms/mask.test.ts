import { describe, expect, it } from "vitest";

import { maskIdentifiersForModel, restorePlaceholdersInText } from "./mask";

describe("maskIdentifiersForModel", () => {
  it("keeps L001 ISO dates and money-like spans unmasked", () => {
    const map = new Map<string, string>();
    const text =
      "Date of Birth: 2017-04-18 IEP Date: 2024-11-12 through 2025-11-11 baseline 42 WCPM";
    const masked = maskIdentifiersForModel(text, map);
    expect(masked).toContain("2017-04-18");
    expect(masked).toContain("2024-11-12");
    expect(masked).toContain("2025-11-11");
    expect(restorePlaceholdersInText(masked, map)).toBe(text);
  });

  it("masks long digit runs outside dates", () => {
    const map = new Map<string, string>();
    const text = "Account 1234567890 on 2024-11-12";
    const masked = maskIdentifiersForModel(text, map);
    expect(masked).toContain("2024-11-12");
    expect(masked).not.toContain("1234567890");
    expect(restorePlaceholdersInText(masked, map)).toBe(text);
  });
});
