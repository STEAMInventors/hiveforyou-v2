import type { CaseProvenanceBundle, ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

export type ProvenanceIndex = {
  byClaimId: Map<string, ResolvedEvidenceRef[]>;
};

export function buildProvenanceIndex(bundle: CaseProvenanceBundle): ProvenanceIndex {
  const byClaimId = new Map<string, ResolvedEvidenceRef[]>();
  for (const claim of bundle.claims) {
    byClaimId.set(claim.claimId, claim.documentEvidence);
  }
  return { byClaimId };
}

export function claimDomainIds(
  claimId: string,
  index: ProvenanceIndex,
): string[] {
  const refs = index.byClaimId.get(claimId) ?? [];
  const domains = new Set<string>();
  for (const ref of refs) {
    if (ref.logicalDomainId) {
      domains.add(ref.logicalDomainId);
    }
  }
  return [...domains];
}
