import { describe, expect, it } from "vitest";

import { validateNarrativeTemplate } from "./validate-narrative-block";

describe("validateNarrativeTemplate", () => {
  it("throws when say holes differ from slots", () => {
    expect(() =>
      validateNarrativeTemplate({
        id: "bad",
        chapter: "then",
        when: { kind: "anchorExists", role: "prior" },
        say: "Hello {a} and {b}",
        slots: ["a"],
      }),
    ).toThrow(/must exactly match slots/);
  });
});
