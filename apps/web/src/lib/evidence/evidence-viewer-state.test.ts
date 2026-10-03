import { describe, expect, it } from "vitest";

import type { ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { launchViewerFromPair, launchViewerSingle } from "./evidence-viewer-state";

const refA: ResolvedEvidenceRef = {
  id: "a",
  sourceDocumentId: "doc-a",
  sourceType: "document",
  page: 6,
};

const refB: ResolvedEvidenceRef = {
  id: "b",
  sourceDocumentId: "doc-b",
  sourceType: "document",
  page: 7,
};

describe("evidence-viewer-state", () => {
  it("launches single-document viewer", () => {
    const launch = launchViewerSingle(refA);
    expect(launch.mode).toBe("single");
    expect(launch.panes).toHaveLength(1);
    expect(launch.panes[0]?.page).toBe(6);
  });

  it("launches compare mode for both sides", () => {
    const launch = launchViewerFromPair("both", refA, refB);
    expect(launch.mode).toBe("compare");
    expect(launch.panes).toHaveLength(2);
  });
});
