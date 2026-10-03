import { describe, expect, it } from "vitest";

import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";

import { buildCaseSummaryModel } from "./case-summary-presentation";

describe("buildCaseSummaryModel", () => {
  it("maps L001 fixture into summary sections", () => {
    const { caseMap, provenance, proView } = l001CaseMapViewFixture();
    const claimsById = new Map(proView.claims.map((claim) => [claim.id, claim]));
    const model = buildCaseSummaryModel({
      caseMap,
      conflicts: proView.conflicts,
      claimsById,
      provenance: buildProvenanceIndex(provenance),
      documentCount: 1,
    });
    expect(model.decisions.length).toBeGreaterThan(0);
    expect(model.changes.length).toBe(1);
    expect(model.gaps.length).toBeGreaterThan(0);
    expect(model.statusCounts.checked).toBeGreaterThan(0);
  });
});
