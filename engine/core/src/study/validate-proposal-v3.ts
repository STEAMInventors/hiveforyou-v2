import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { ValidationIssue } from "@hiveforyou/shared/canonical-study";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V5,
  validateCanonicalStudyProposal as validateProposalContract,
  type CanonicalStudyProposal,
  type ClaimValue,
  type ProposedClaim,
} from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import {
  documentIdsInContext,
  validateDocumentEvidenceRefs,
} from "./validate-document-evidence";
import { sanitizeVoiceProposal } from "./sanitize-voice-proposal";

function issue(
  partial: Omit<ValidationIssue, "severity"> & { severity?: ValidationIssue["severity"] },
): ValidationIssue {
  return {
    severity: partial.severity ?? "reject",
    ...partial,
  };
}

function contractIssuesToValidationIssues(
  errors: { path: string; message: string }[],
): ValidationIssue[] {
  return errors.map((err) =>
    issue({
      code: "MALFORMED_PROPOSAL",
      message: `${err.path}: ${err.message}`,
      severity: "fatal",
      path: err.path,
    }),
  );
}

function validateClaimValueShape(
  value: ClaimValue,
  entityIds: Set<string>,
  claimId: string,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  switch (value.kind) {
    case "quantity":
      if (typeof value.amount !== "number" || !Number.isFinite(value.amount)) {
        errors.push(
          issue({
            code: "INVALID_CLAIM_VALUE",
            message: "Quantity value must be a finite number.",
            relatedIds: [claimId],
            path: `claims.${claimId}.value`,
          }),
        );
      }
      break;
    case "text":
      if (!value.text?.trim()) {
        errors.push(
          issue({
            code: "INVALID_CLAIM_VALUE",
            message: "Text value must be non-empty.",
            relatedIds: [claimId],
          }),
        );
      }
      break;
    case "code":
      if (!value.code?.trim()) {
        errors.push(
          issue({
            code: "INVALID_CLAIM_VALUE",
            message: "Code value must be non-empty.",
            relatedIds: [claimId],
          }),
        );
      }
      break;
    case "boolean":
      if (typeof value.value !== "boolean") {
        errors.push(
          issue({
            code: "INVALID_CLAIM_VALUE",
            message: "Boolean value must be true or false.",
            relatedIds: [claimId],
          }),
        );
      }
      break;
    case "entity_ref":
      if (!entityIds.has(value.entityId)) {
        errors.push(
          issue({
            code: "INTEGRITY_ENTITY_REFERENCE",
            message: "entity_ref value must reference a proposed entity id.",
            relatedIds: [claimId, value.entityId],
            path: `claims.${claimId}.value.entityId`,
          }),
        );
      }
      break;
    case "date":
      if (!value.value?.trim()) {
        errors.push(
          issue({
            code: "INVALID_CLAIM_VALUE",
            message: "Date value must be non-empty.",
            relatedIds: [claimId],
          }),
        );
      }
      break;
    case "period":
      break;
    case "unknown":
      break;
    default: {
      const _exhaustive: never = value;
      void _exhaustive;
      errors.push(
        issue({
          code: "INVALID_CLAIM_VALUE",
          message: "Unknown claim value kind.",
          relatedIds: [claimId],
          severity: "fatal",
        }),
      );
    }
  }
  return errors;
}

function validateMissingLineage(
  itemId: string,
  studyRunId: string,
  context: CanonicalStudyContext,
  pathPrefix: string,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (studyRunId !== context.studyRunId) {
    errors.push(
      issue({
        code: "INTEGRITY_LINEAGE",
        message: "proposalLineage.studyRunId must match the active study run.",
        path: `${pathPrefix}.proposalLineage.studyRunId`,
        relatedIds: [itemId],
      }),
    );
  }
  return errors;
}

export function validateCanonicalStudyProposalV3(
  context: CanonicalStudyContext,
  proposalInput: unknown,
): CanonicalStudyValidationResultV3 {
  const validationErrors: ValidationIssue[] = [];
  const provenanceErrors: ValidationIssue[] = [];
  const integrityErrors: ValidationIssue[] = [];
  const rejected: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const unresolved: ValidationIssue[] = [];

  const contract = validateProposalContract(proposalInput);
  if (!contract.ok) {
    validationErrors.push(...contractIssuesToValidationIssues(contract.errors));
    return finalizeV3({
      validationErrors,
      provenanceErrors,
      integrityErrors,
      rejected,
      warnings,
      unresolved,
    });
  }

  const proposal = contract.value;
  if (
    proposal.schemaVersion !== CANONICAL_STUDY_PROPOSAL_SCHEMA_V3 &&
    proposal.schemaVersion !== CANONICAL_STUDY_PROPOSAL_SCHEMA_V5
  ) {
    validationErrors.push(
      issue({
        code: "SCHEMA_VERSION_MISMATCH",
        message: "Proposal schema version is not supported.",
        severity: "fatal",
      }),
    );
    return finalizeV3({
      validationErrors,
      provenanceErrors,
      integrityErrors,
      rejected,
      warnings,
      unresolved,
    });
  }

  proposal.voiceProposal = sanitizeVoiceProposal(context, proposal.voiceProposal ?? null);

  if (proposal.domainId !== context.domainId) {
    validationErrors.push(
      issue({
        code: "DOMAIN_ID_MISMATCH",
        message: "Proposal domainId does not match study context.",
        severity: "fatal",
      }),
    );
    return finalizeV3({
      validationErrors,
      provenanceErrors,
      integrityErrors,
      rejected,
      warnings,
      unresolved,
    });
  }

  const knownDocs = documentIdsInContext(context);
  const proposedEntityIds = new Set(proposal.entities.map((entity) => entity.id));
  const proposedClaimIds = new Set(proposal.claims.map((claim) => claim.id));

  const acceptedEntityIds = new Set<string>();
  const acceptedEntities = proposal.entities.filter((entity) => {
    const provErrors = validateDocumentEvidenceRefs(
      context,
      entity.id,
      entity.evidenceRefs,
      knownDocs,
      `entities.${entity.id}`,
      { requireAtLeastOne: true, requireLocator: true },
    );
    if (provErrors.length) {
      for (const err of provErrors) {
        provenanceErrors.push(err);
        rejected.push(err);
      }
      return false;
    }
    acceptedEntityIds.add(entity.id);
    return true;
  });

  const rejectedClaimIds = new Set<string>();
  const acceptedClaims: ProposedClaim[] = [];

  for (const claim of proposal.claims) {
    const provErrors = validateDocumentEvidenceRefs(
      context,
      claim.id,
      claim.evidenceRefs,
      knownDocs,
      `claims.${claim.id}`,
      { requireAtLeastOne: true, requireLocator: true },
    );
    if (provErrors.length) {
      for (const err of provErrors) {
        provenanceErrors.push(err);
        rejected.push(err);
      }
      rejectedClaimIds.add(claim.id);
      continue;
    }

    if (!acceptedEntityIds.has(claim.subjectEntityId)) {
      const err = issue({
        code: "INTEGRITY_ENTITY_REFERENCE",
        message: "Claim references unknown entity.",
        relatedIds: [claim.id, claim.subjectEntityId],
      });
      integrityErrors.push(err);
      rejected.push(err);
      rejectedClaimIds.add(claim.id);
      continue;
    }

    const valueErrors = validateClaimValueShape(claim.value, proposedEntityIds, claim.id);
    if (valueErrors.length) {
      for (const err of valueErrors) {
        integrityErrors.push(err);
        rejected.push(err);
      }
      rejectedClaimIds.add(claim.id);
      continue;
    }

    acceptedClaims.push(claim);
  }

  const acceptedConflicts = proposal.conflicts.filter((conflict) => {
    const unknownClaim = conflict.claimIds.find((id) => !proposedClaimIds.has(id));
    if (unknownClaim) {
      const err = issue({
        code: "INTEGRITY_CONFLICT_REFERENCE",
        message: "Conflict references unknown proposal claim id.",
        relatedIds: conflict.claimIds,
      });
      integrityErrors.push(err);
      rejected.push(err);
      return false;
    }
    return true;
  });

  const acceptedMissingInformation = proposal.missingInformation.filter((gap) => {
    const lineageErrors = validateMissingLineage(
      gap.id,
      gap.proposalLineage.studyRunId,
      context,
      `missingInformation.${gap.id}`,
    );
    if (gap.proposalLineage.proposalItemId !== gap.id) {
      lineageErrors.push(
        issue({
          code: "INTEGRITY_LINEAGE",
          message: "proposalLineage.proposalItemId must match missingInformation id.",
          path: `missingInformation.${gap.id}.proposalLineage.proposalItemId`,
          relatedIds: [gap.id],
        }),
      );
    }
    if (lineageErrors.length) {
      for (const err of lineageErrors) {
        integrityErrors.push(err);
        rejected.push(err);
      }
      return false;
    }

    if (gap.subjectEntityId && !proposedEntityIds.has(gap.subjectEntityId)) {
      const err = issue({
        code: "INTEGRITY_ENTITY_REFERENCE",
        message: "Missing information references unknown entity.",
        relatedIds: [gap.id, gap.subjectEntityId],
      });
      integrityErrors.push(err);
      rejected.push(err);
      return false;
    }

    if (gap.evidenceRefs?.length) {
      const provErrors = validateDocumentEvidenceRefs(
        context,
        gap.id,
        gap.evidenceRefs,
        knownDocs,
        `missingInformation.${gap.id}`,
        { requireAtLeastOne: false, requireLocator: true },
      );
      if (provErrors.length) {
        for (const err of provErrors) {
          provenanceErrors.push(err);
          rejected.push(err);
        }
        return false;
      }
    }
    return true;
  });

  return finalizeV3({
    validationErrors,
    provenanceErrors,
    integrityErrors,
    rejected,
    warnings,
    unresolved,
    accepted: {
      entities: acceptedEntities,
      claims: acceptedClaims,
      conflicts: acceptedConflicts,
      missingInformation: acceptedMissingInformation,
    },
  });
}

type FinalizeV3Params = {
  validationErrors: ValidationIssue[];
  provenanceErrors: ValidationIssue[];
  integrityErrors: ValidationIssue[];
  rejected: ValidationIssue[];
  warnings: ValidationIssue[];
  unresolved: ValidationIssue[];
  accepted?: CanonicalStudyValidationResultV3["accepted"];
};

function finalizeV3(params: FinalizeV3Params): CanonicalStudyValidationResultV3 {
  const {
    validationErrors,
    provenanceErrors,
    integrityErrors,
    rejected,
    warnings,
    unresolved,
    accepted: acceptedOverride,
  } = params;

  const accepted = acceptedOverride ?? {
    entities: [],
    claims: [],
    conflicts: [],
    missingInformation: [],
  };

  const hasFatal = [...validationErrors, ...integrityErrors, ...rejected].some(
    (item) => item.severity === "fatal",
  );

  if (hasFatal) {
    return {
      status: "FAILED",
      accepted,
      rejected,
      warnings,
      unresolved,
      validationErrors,
      provenanceErrors,
      integrityErrors,
    };
  }

  const hasMaterialOutput =
    accepted.claims.length > 0 ||
    accepted.conflicts.length > 0 ||
    accepted.missingInformation.length > 0;

  if (!hasMaterialOutput && rejected.length > 0) {
    return {
      status: "FAILED",
      accepted,
      rejected,
      warnings,
      unresolved,
      validationErrors,
      provenanceErrors,
      integrityErrors,
    };
  }

  return {
    status: "SUCCEEDED",
    accepted,
    rejected,
    warnings,
    unresolved,
    validationErrors,
    provenanceErrors,
    integrityErrors,
  };
}

/** Test hook: assert novel constructs are not pack-gated. */
export function isDomainPackConstructGatingIssue(_issue: ValidationIssue): boolean {
  return false;
}

export type { CanonicalStudyProposal };
