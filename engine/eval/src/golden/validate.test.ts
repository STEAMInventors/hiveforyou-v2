import { describe, expect, it } from "vitest";

import { validateGoldenCase } from "./validate.js";
import type { DraftGoldenCase } from "./types.js";

const draftSkeleton = (): DraftGoldenCase => ({
  caseId: "l001",
  split: "tune",
  corpusDir: "engine/intake/fixtures/l001",
  facts: [],
  gaps: [],
  tripwires: [],
  verifiedBy: null,
  draft: true,
});

describe("validateGoldenCase", () => {
  it("accepts an explicitly unverified draft", () => {
    const result = validateGoldenCase(draftSkeleton());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verifiedBy).toBeNull();
    }
  });

  it("rejects certified shape without verifiedBy", () => {
    const result = validateGoldenCase({
      ...draftSkeleton(),
      verifiedBy: "",
      draft: false,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts certified golden with verifiedBy", () => {
    const result = validateGoldenCase({
      ...draftSkeleton(),
      verifiedBy: "reviewer@example.com",
      draft: false,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid split and gap kind", () => {
    const result = validateGoldenCase({
      ...draftSkeleton(),
      split: "train",
      gaps: [{ id: "g1", gapKind: "unknown_gap", description: "x" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "split")).toBe(true);
      expect(result.issues.some((i) => i.path.includes("gapKind"))).toBe(true);
    }
  });

  it("requires document provenance on facts", () => {
    const result = validateGoldenCase({
      ...draftSkeleton(),
      facts: [
        {
          id: "f1",
          documentId: "01_initial_referral.pdf",
          pageNumber: 1,
          wordRange: [0, 2],
          valueKind: "text",
          value: { kind: "text", textValue: "hello" },
          acceptableModalities: ["observed"],
        },
      ],
    });
    expect(result.ok).toBe(true);

    const bad = validateGoldenCase({
      ...draftSkeleton(),
      facts: [
        {
          id: "f1",
          documentId: "",
          pageNumber: 0,
          wordRange: [2, 1],
          valueKind: "text",
          value: { kind: "text", textValue: "hello" },
          acceptableModalities: ["not_a_modality"],
        },
      ],
    });
    expect(bad.ok).toBe(false);
  });
});
