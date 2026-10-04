import { describe, expect, it } from "vitest";

import { engine2RuntimeProposalBindingLines } from "./engine2-proposal-binding";

describe("engine2RuntimeProposalBindingLines", () => {
  it("returns binding lines for v4 prompt only", () => {
    expect(engine2RuntimeProposalBindingLines("v4").join("\n")).toContain(
      "canonical-study-proposal/3",
    );
    expect(engine2RuntimeProposalBindingLines("v3")).toEqual([]);
  });
});
