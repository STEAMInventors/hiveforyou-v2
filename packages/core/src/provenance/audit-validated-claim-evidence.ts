import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { EvidenceProvenanceResolution, ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

export type ClaimEvidenceAuditRow = {
  claimId: string;
  evidenceRefId: string;
  resolution: EvidenceProvenanceResolution;
  resolutionIssues?: string[];
};

export type ValidatedClaimEvidenceAudit = {
  claimsWithoutEvidence: string[];
  refs: ClaimEvidenceAuditRow[];
  exactCount: number;
  partialCount: number;
  unresolvedCount: number;
};

/** Audit validated claims intended for projection — every claim must have >=1 evidence ref. */
export function auditValidatedClaimEvidence(input: {
  snapshot: CanonicalCaseSnapshot;
  resolveRef: (claimId: string, ref: CanonicalCaseSnapshot["claims"][number]["evidenceRefs"][number]) => ResolvedEvidenceRef;
}): ValidatedClaimEvidenceAudit {
  const claimsWithoutEvidence: string[] = [];
  const refs: ClaimEvidenceAuditRow[] = [];

  for (const claim of input.snapshot.claims) {
    if (!claim.evidenceRefs.length) {
      claimsWithoutEvidence.push(claim.id);
      continue;
    }
    for (const ref of claim.evidenceRefs) {
      const resolved = input.resolveRef(claim.id, ref);
      refs.push({
        claimId: claim.id,
        evidenceRefId: ref.id,
        resolution: resolved.resolution ?? "UNRESOLVED",
        resolutionIssues: resolved.resolutionIssues,
      });
    }
  }

  let exactCount = 0;
  let partialCount = 0;
  let unresolvedCount = 0;
  for (const row of refs) {
    if (row.resolution === "EXACT") {
      exactCount += 1;
    } else if (row.resolution === "PARTIAL") {
      partialCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }

  return {
    claimsWithoutEvidence,
    refs,
    exactCount,
    partialCount,
    unresolvedCount,
  };
}
