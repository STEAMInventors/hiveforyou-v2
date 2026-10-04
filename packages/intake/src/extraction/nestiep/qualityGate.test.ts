import { describe, expect, it } from "vitest";

import { canSkipOperatorList, computePageQualityMetrics, decideNativeVsOcr } from "./qualityGate";

describe("qualityGate", () => {
  it("does not request OCR for short native text when the page has no images", () => {
    const metrics = computePageQualityMetrics({
      rawText: "Parent consent: Yes, 11/12/2024",
      textItemCount: 3,
      estimatedCoverage: 0.01,
      imageOperatorCount: 0,
    });
    const decision = decideNativeVsOcr(metrics);
    expect(decision.useOcr).toBe(false);
  });

  it("allows skipping operator list when meaningful text exceeds sparse thresholds", () => {
    const text = `${"Word ".repeat(30)}${"0123456789".repeat(9)}`;
    const metrics = computePageQualityMetrics({
      rawText: text,
      textItemCount: 40,
      estimatedCoverage: 0.02,
      imageOperatorCount: 0,
    });
    expect(canSkipOperatorList(metrics.meaningfulCharacterCount)).toBe(true);
    const skipped = decideNativeVsOcr({ ...metrics, imageOperatorCount: 0 });
    const withImages = decideNativeVsOcr({ ...metrics, imageOperatorCount: 5 });
    expect(skipped.useOcr).toBe(withImages.useOcr);
    expect(skipped.reasons).toEqual(withImages.reasons);
  });
});
