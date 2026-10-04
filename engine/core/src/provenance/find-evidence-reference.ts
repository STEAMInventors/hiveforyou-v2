import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { EvidenceReference } from "@hiveforyou/shared/case-intelligence/3";

export type LocatedEvidenceReference = {
  ref: EvidenceReference;
  claimId?: string;
};

function collectRefs(
  refs: EvidenceReference[] | undefined,
  claimId?: string,
): LocatedEvidenceReference[] {
  if (!refs?.length) {
    return [];
  }
  return refs.map((ref) => ({ ref, claimId }));
}

/** Find a persisted evidence ref id anywhere in a canonical case snapshot. */
export function findEvidenceReferenceInSnapshot(
  snapshot: CanonicalCaseSnapshot,
  evidenceRefId: string,
): LocatedEvidenceReference | null {
  for (const claim of snapshot.claims) {
    for (const located of collectRefs(claim.evidenceRefs, claim.id)) {
      if (located.ref.id === evidenceRefId) {
        return located;
      }
    }
  }
  for (const entity of snapshot.entities) {
    for (const located of collectRefs(entity.evidenceRefs)) {
      if (located.ref.id === evidenceRefId) {
        return located;
      }
    }
  }
  for (const event of snapshot.events) {
    for (const located of collectRefs(event.evidenceRefs)) {
      if (located.ref.id === evidenceRefId) {
        return located;
      }
    }
  }
  for (const item of snapshot.unresolved) {
    for (const located of collectRefs(item.evidenceRefs)) {
      if (located.ref.id === evidenceRefId) {
        return located;
      }
    }
  }
  return null;
}
