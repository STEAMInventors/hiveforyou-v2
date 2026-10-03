import { describe, expect, it } from "vitest";

import { l001LikeCanonicalSnapshot } from "@hiveforyou/core";

import { l001CaseMapViewFixture } from "@/lib/case-map/fixtures/l001-case-map-fixture";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";

import { buildCaseSummaryModel } from "./case-summary-presentation";
import { buildProFactRows, countProStates } from "./case-summary-pro-presentation";

describe("case-summary pro presentation", () => {
  it("builds pro fact rows from the parent summary model", () => {
    const { caseMap, provenance, proView } = l001CaseMapViewFixture();
    const claimsById = new Map(proView.claims.map((claim) => [claim.id, claim]));
    const summary = buildCaseSummaryModel({
      caseMap,
      conflicts: proView.conflicts,
      claimsById,
      provenance: buildProvenanceIndex(provenance),
      documentCount: l001LikeCanonicalSnapshot().sourceDocuments.length,
    });
    const rows = buildProFactRows({ summary, answers: {}, claimsById, caseMap });
    expect(rows.length).toBeGreaterThan(0);
    const counts = countProStates(rows, 0);
    expect(counts.CHANGED).toBeGreaterThanOrEqual(1);
  });
});
