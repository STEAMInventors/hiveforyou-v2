import { describe, expect, it } from "vitest";

import { estimateReaderExperimentDryRun } from "./dry-run-estimate.js";

describe("estimateReaderExperimentDryRun", () => {
  it("flags output truncation risk against configured max tokens", () => {
    const estimate = estimateReaderExperimentDryRun({
      configuredMaxOutputTokens: 16_000,
      goldenFactCount: 117,
      stablePrefixCharCount: 10_000,
      documentBundleCharCount: 12_000,
    });
    expect(estimate.label).toBe("ESTIMATE");
    expect(estimate.verifierSubmissionCapacity).toBe(156);
    expect(estimate.outputTruncationRisk).toBe(true);
  });
});
