import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { mapV4EvidenceRefToWordRange } from "../../atoms/map-v4-evidence";
import type { PageWordRange } from "../../atoms/types";
import { wordRangesOverlap } from "../../atoms/types";
import type { PageModel } from "../../document/page-model";
import type { StudyFinding } from "../primitives/types";

export type V4AcceptedClaim = {
  id: string;
  evidenceRefs: {
    id?: string;
    sourceDocumentId: string;
    page: number;
    extractionId?: string | null;
    snippet?: string | null;
  }[];
};

export type ReferenceCoverage = {
  refId: string;
  covered: boolean;
  wordRange: PageWordRange | null;
};

export type ClaimCoverage = {
  claimId: string;
  covered: boolean;
  partial: boolean;
  references: ReferenceCoverage[];
  primarySnippet: string;
};

export type V4CoverageReport = {
  totalClaims: number;
  coveredClaims: number;
  coveragePercent: number;
  claims: ClaimCoverage[];
  uncoveredClaims: ClaimCoverage[];
  shadowOnlyFacts: StudyFinding[];
};

function factWordRanges(finding: StudyFinding): PageWordRange[] {
  return finding.evidence.map((span) => ({
    documentId: span.documentId,
    pageNumber: span.pageNumber,
    wordStart: span.wordRange[0],
    wordEnd: span.wordRange[1],
  }));
}

function refOverlapsFact(
  refRange: PageWordRange,
  facts: StudyFinding[],
): boolean {
  for (const fact of facts) {
    if (fact.kind !== "fact") {
      continue;
    }
    for (const factRange of factWordRanges(fact)) {
      if (wordRangesOverlap(refRange, factRange)) {
        return true;
      }
    }
  }
  return false;
}

export function compareV4Coverage(input: {
  claims: V4AcceptedClaim[];
  facts: StudyFinding[];
  sourceIdToDocumentId: Map<string, string>;
  recoveredPagesByDoc: Map<string, NestIepRecoveredPage[]>;
  pageModelsByDoc: Map<string, PageModel[]>;
}): V4CoverageReport {
  const claimRows: ClaimCoverage[] = [];

  for (const claim of input.claims) {
    const references: ReferenceCoverage[] = [];
    for (const ref of claim.evidenceRefs) {
      const documentId = input.sourceIdToDocumentId.get(ref.sourceDocumentId);
      const refId = ref.id ?? `${claim.id}:${ref.sourceDocumentId}:${ref.page}`;
      if (!documentId) {
        references.push({ refId, covered: false, wordRange: null });
        continue;
      }
      const pages = input.pageModelsByDoc.get(documentId) ?? [];
      const recovered = input.recoveredPagesByDoc.get(documentId) ?? [];
      const pageModel = pages.find((p) => p.pageNumber === ref.page);
      const recoveredPage = recovered.find((p) => p.pageNumber === ref.page);
      if (!pageModel || !recoveredPage) {
        references.push({ refId, covered: false, wordRange: null });
        continue;
      }
      const wordRange = mapV4EvidenceRefToWordRange({
        documentId,
        recoveredPage,
        pageModel,
        ref,
      });
      const covered = wordRange ? refOverlapsFact(wordRange, input.facts) : false;
      references.push({ refId, covered, wordRange });
    }
    const covered = references.some((r) => r.covered);
    const partial =
      references.length > 1 &&
      references.some((r) => r.covered) &&
      references.some((r) => !r.covered);
    claimRows.push({
      claimId: claim.id,
      covered,
      partial,
      references,
      primarySnippet: claim.evidenceRefs[0]?.snippet ?? "",
    });
  }

  const coveredClaims = claimRows.filter((c) => c.covered).length;
  const totalClaims = claimRows.length;
  const v4Ranges = claimRows.flatMap((c) =>
    c.references.map((r) => r.wordRange).filter((r): r is PageWordRange => Boolean(r)),
  );

  const shadowOnlyFacts = input.facts.filter((fact) => {
    if (fact.kind !== "fact") {
      return false;
    }
    const ranges = factWordRanges(fact);
    return !ranges.some((range) =>
      v4Ranges.some((v4Range) => wordRangesOverlap(range, v4Range)),
    );
  });

  return {
    totalClaims,
    coveredClaims,
    coveragePercent: totalClaims === 0 ? 0 : (coveredClaims / totalClaims) * 100,
    claims: claimRows,
    uncoveredClaims: claimRows.filter((c) => !c.covered),
    shadowOnlyFacts,
  };
}
