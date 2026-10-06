import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { V4AcceptedClaim } from "./compare-v4";

export function v4ClaimsFromValidation(
  validation: CanonicalStudyValidationResultV3,
): V4AcceptedClaim[] {
  return validation.accepted.claims.map((claim) => ({
    id: claim.id,
    evidenceRefs: claim.evidenceRefs.map((ref) => ({
      id: ref.id,
      sourceDocumentId: ref.sourceDocumentId,
      page: ref.page,
      extractionId: ref.extractionId,
      snippet: ref.snippet,
    })),
  }));
}
