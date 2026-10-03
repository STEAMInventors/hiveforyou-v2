import { describe, expect, it } from "vitest";

import { l001LikeCanonicalSnapshot } from "@hiveforyou/core";

import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";

import { buildCaseSummaryModel } from "./case-summary-presentation";
import { buildProLivingModel } from "./case-summary-pro-living";

describe("case-summary pro living", () => {
  it("builds review-first and compare sections from the case map bundle", () => {
    const { caseMap, provenance, proView } = l001CaseMapViewFixture();
    const claimsById = new Map(proView.claims.map((claim) => [claim.id, claim]));
    const summary = buildCaseSummaryModel({
      caseMap,
      conflicts: proView.conflicts,
      claimsById,
      provenance: buildProvenanceIndex(provenance),
      documentCount: l001LikeCanonicalSnapshot().sourceDocuments.length,
    });
    const model = buildProLivingModel({
      caseMap,
      summary,
      claims: proView.claims,
      provenance: buildProvenanceIndex(provenance),
      sourceDocuments: l001LikeCanonicalSnapshot().sourceDocuments.map((doc) => ({
        sourceDocumentId: doc.sourceDocumentId ?? doc.stagedDocumentId,
        originalFilename: doc.originalFilename,
      })),
    });
    expect(model.facts.length).toBeGreaterThan(0);
    expect(model.signals.length).toBeGreaterThan(0);
    expect(model.compareRows.some((r) => r.kind === "row")).toBe(true);
  });
});
