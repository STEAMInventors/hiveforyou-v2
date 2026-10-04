import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import type { CanonicalStudyProposalV4 } from "@hiveforyou/shared/case-intelligence/4";
import { validateCanonicalStudyProposalV4 as validateV4Contract } from "@hiveforyou/shared/case-intelligence/4";

import { normalizeProposalV4ToV3 } from "./normalize-proposal-v4-to-v3";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";

export function isCanonicalStudyProposalV4(
  proposal: unknown,
): proposal is CanonicalStudyProposalV4 {
  return (
    typeof proposal === "object" &&
    proposal !== null &&
    (proposal as { schemaVersion?: string }).schemaVersion === "canonical-study-proposal/4"
  );
}

/** Validates /4 contract, normalizes to /3 shape, runs provenance validation. */
export function validateCanonicalStudyProposalV4(
  context: CanonicalStudyContext,
  proposal: CanonicalStudyProposalV4 | CanonicalStudyProposal | unknown,
): CanonicalStudyValidationResultV3 {
  if (!isCanonicalStudyProposalV4(proposal)) {
    return validateCanonicalStudyProposalV3(context, proposal as CanonicalStudyProposal);
  }
  const contract = validateV4Contract(proposal);
  if (!contract.ok) {
    return {
      status: "FAILED",
      accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
      rejected: contract.errors.map((err) => ({
        severity: "fatal" as const,
        code: "MALFORMED_PROPOSAL",
        message: `${err.path}: ${err.message}`,
        path: err.path,
      })),
      warnings: [],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    };
  }
  const normalized = normalizeProposalV4ToV3(contract.value);
  return validateCanonicalStudyProposalV3(context, normalized);
}
