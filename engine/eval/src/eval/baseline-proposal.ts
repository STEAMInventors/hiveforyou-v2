import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
  CLAIM_MODALITIES,
  type CanonicalStudyProposalV4,
  type ClaimModality,
  type ConstructPartsProposal,
  type EvidenceReferenceV4,
  type ProposedClaimV4,
  type ProposedEntityV4,
} from "@hiveforyou/shared/case-intelligence/4";

import {
  baselineClaimValueToV4,
  type BaselineAcceptedClaim,
  type BaselineEvidenceRef,
  type StudyBaseline,
} from "./baseline-types.js";

export type BaselineProposalLimits = {
  /** Accepted claims only; T0.2 baselines do not persist accepted conflicts or missingInformation. */
  missingFields: readonly string[];
};

const BASELINE_PROPOSAL_LIMITS: BaselineProposalLimits = {
  missingFields: ["acceptedConflicts", "acceptedMissingInformation", "entities (full)", "voiceProposal"],
};

export function baselineProposalLimits(): BaselineProposalLimits {
  return BASELINE_PROPOSAL_LIMITS;
}

function parseConstruct(construct: string): ConstructPartsProposal {
  const parts = construct.split("|");
  return {
    measure: parts[0] ?? construct,
    task: parts[1]?.length ? parts[1] : null,
    administration: parts[2]?.length ? parts[2] : null,
  };
}

function roleToModality(claim: BaselineAcceptedClaim): ClaimModality {
  const raw = claim.modality ?? claim.role ?? "observed";
  if (typeof raw === "string" && (CLAIM_MODALITIES as readonly string[]).includes(raw)) {
    return raw as ClaimModality;
  }
  return "unknown";
}

function evidenceRefToV4(ref: BaselineEvidenceRef): EvidenceReferenceV4 {
  const quote = (ref.quote ?? ref.snippet ?? "").trim();
  return {
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    logicalDocumentId: ref.logicalDocumentId,
    page: ref.page,
    pageEnd: ref.pageEnd,
    quote,
    extractionId: ref.extractionId,
    sourceType: "document",
  };
}

function claimToV4(claim: BaselineAcceptedClaim): ProposedClaimV4 {
  return {
    id: claim.id,
    subjectEntityId: claim.subjectEntityId,
    construct: parseConstruct(claim.construct),
    value: baselineClaimValueToV4(claim.value),
    unit: claim.unit ?? null,
    modality: roleToModality(claim),
    effectivePeriod: claim.effectivePeriod
      ? {
          start: claim.effectivePeriod.start,
          end: claim.effectivePeriod.end,
          precision:
            claim.effectivePeriod.precision === "day" ||
            claim.effectivePeriod.precision === "month" ||
            claim.effectivePeriod.precision === "year" ||
            claim.effectivePeriod.precision === "unknown"
              ? claim.effectivePeriod.precision
              : undefined,
        }
      : undefined,
    occurredOn: claim.occurredOn,
    evidenceRefs: claim.evidenceRefs.map(evidenceRefToV4),
  };
}

function stubEntities(claims: ProposedClaimV4[]): ProposedEntityV4[] {
  const ids = [...new Set(claims.map((c) => c.subjectEntityId))].sort((a, b) => a.localeCompare(b));
  return ids.map((id) => ({
    id,
    entityType: "entity",
    label: id,
    evidenceRefs: [],
  }));
}

/** Build the graded candidate from saved baseline accepted claims (no model calls). */
export function proposalFromStudyBaseline(baseline: StudyBaseline): CanonicalStudyProposalV4 {
  const claims = [...(baseline.acceptedClaims ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(claimToV4);

  return {
    schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
    domainId: "iep",
    entities: stubEntities(claims),
    claims,
    conflicts: [],
    missingInformation: [],
    voiceProposal: null,
    modelMetadata: {
      providerId: baseline.proposalModelMetadata?.providerId ?? "baseline-replay",
      modelId: baseline.proposalModelMetadata?.modelId,
      proposalMode:
        baseline.proposalModelMetadata?.proposalMode === "fixture" ? "fixture" : "production",
    },
    proposedAt: "1970-01-01T00:00:00.000Z",
  };
}
