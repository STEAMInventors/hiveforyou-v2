import type {
  CanonicalStudyProposal,
  ClaimValue,
  EffectivePeriod,
  EvidenceReference,
  ProposedClaim,
} from "@hiveforyou/shared/case-intelligence/3";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V5,
} from "@hiveforyou/shared/case-intelligence/3";
import type { VoiceProposal, VoiceProposalToken } from "@hiveforyou/shared/projections";
import type {
  CanonicalStudyProposalV4,
  ClaimModality,
  ClaimValueV4,
  EvidenceReferenceV4,
} from "@hiveforyou/shared/case-intelligence/4";
import { buildConstructKey } from "@hiveforyou/shared/projections";

import { normalizeOpenAIClaimValue } from "./normalize-openai-claim-value-v3";

function modalityToRole(modality: ClaimModality): CanonicalStudyProposal["claims"][number]["role"] {
  switch (modality) {
    case "planned":
    case "required":
    case "decided":
    case "observed":
    case "unknown":
      return modality;
    default:
      return "unknown";
  }
}

function isOpenAITransportClaimValue(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "numberValue" in value &&
    "textValue" in value
  );
}

function claimValueV4ToV3(value: ClaimValueV4): ClaimValue {
  switch (value.kind) {
    case "quantity":
      return { kind: "quantity", amount: value.numberValue };
    case "text":
      return { kind: "text", text: value.textValue };
    case "code":
      return { kind: "code", code: value.codeValue };
    case "boolean":
      return { kind: "boolean", value: value.booleanValue };
    case "entity_ref":
      return { kind: "entity_ref", entityId: value.entityId };
    case "date":
      return { kind: "date", value: value.dateValue };
    case "period":
      return {
        kind: "period",
        start: value.periodStart ?? undefined,
        end: value.periodEnd ?? undefined,
      };
    default:
      return { kind: "unknown" };
  }
}

function optionalNonEmptyString(value: string | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function effectivePeriodV4ToV3(
  period: CanonicalStudyProposalV4["claims"][number]["effectivePeriod"],
): EffectivePeriod | undefined {
  if (period == null) {
    return undefined;
  }
  const start = optionalNonEmptyString(period.start ?? null);
  const end = optionalNonEmptyString(period.end ?? null);
  const precision = period.precision ?? undefined;
  if (!start && !end && !precision) {
    return undefined;
  }
  return {
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(precision ? { precision } : {}),
  };
}

function claimTemporalFieldsV4ToV3(claim: CanonicalStudyProposalV4["claims"][number]): Pick<
  ProposedClaim,
  "occurredOn" | "effectivePeriod"
> {
  const occurredOn = optionalNonEmptyString(claim.occurredOn ?? null);
  const effectivePeriod = effectivePeriodV4ToV3(claim.effectivePeriod);
  if (occurredOn) {
    return { occurredOn };
  }
  if (effectivePeriod) {
    return { effectivePeriod };
  }
  return {};
}

function evidenceV4ToV3(ref: EvidenceReferenceV4): EvidenceReference {
  const snippet = ref.quote?.trim();
  const out: EvidenceReference = {
    id: ref.id,
    sourceDocumentId: ref.sourceDocumentId,
    sourceType: "document",
  };
  if (ref.logicalDocumentId?.trim()) {
    out.logicalDocumentId = ref.logicalDocumentId.trim();
  }
  if (typeof ref.page === "number" && ref.page >= 1) {
    out.page = ref.page;
  }
  if (typeof ref.pageEnd === "number" && ref.pageEnd >= 1) {
    out.pageEnd = ref.pageEnd;
  }
  if (typeof ref.spanStart === "number" && ref.spanStart >= 0) {
    out.spanStart = ref.spanStart;
  }
  if (typeof ref.spanEnd === "number" && ref.spanEnd >= 0) {
    out.spanEnd = ref.spanEnd;
  }
  if (snippet) {
    out.snippet = snippet;
  }
  if (ref.extractionId?.trim()) {
    out.extractionId = ref.extractionId.trim();
  }
  return out;
}

function mapVoiceToken(token: VoiceProposalToken | undefined): VoiceProposalToken {
  const empty: VoiceProposalToken = { value: null, from: null };
  if (!token) {
    return empty;
  }
  return {
    value: token.value ?? null,
    from: token.from ?? null,
    evidenceRefs: token.evidenceRefs?.map((ref) =>
      evidenceV4ToV3(ref as unknown as EvidenceReferenceV4),
    ),
  };
}

function mapVoiceProposal(raw: VoiceProposal | null | undefined): VoiceProposal | null {
  if (!raw) {
    return null;
  }
  return {
    subject: mapVoiceToken(raw.subject),
    eventNoun: mapVoiceToken(raw.eventNoun),
    helperNoun: mapVoiceToken(raw.helperNoun),
    otherPartyNoun: mapVoiceToken(raw.otherPartyNoun),
    subjectName: mapVoiceToken(raw.subjectName),
  };
}

export function normalizeProposalV4ToV3(proposal: CanonicalStudyProposalV4): CanonicalStudyProposal {
  const voiceProposal = mapVoiceProposal(proposal.voiceProposal ?? null);
  return {
    schemaVersion: voiceProposal
      ? CANONICAL_STUDY_PROPOSAL_SCHEMA_V5
      : CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
    domainId: proposal.domainId,
    entities: proposal.entities.map((entity) => ({
      id: entity.id,
      entityType: entity.entityType,
      label: entity.label,
      evidenceRefs: entity.evidenceRefs.map(evidenceV4ToV3),
    })),
    claims: proposal.claims.map((claim, index) => {
      const normalizedValue = isOpenAITransportClaimValue(claim.value)
        ? normalizeOpenAIClaimValue(claim.value, {
            claimUnit: claim.unit ?? null,
            path: `claims[${index}].value`,
          })
        : {
            value: claimValueV4ToV3(claim.value as ClaimValueV4),
            unit: claim.unit ?? undefined,
          };
      const construct = buildConstructKey({
        measure: claim.construct.measure,
        task: claim.construct.task ?? null,
        administration: claim.construct.administration ?? null,
      });
      return {
        id: claim.id,
        subjectEntityId: claim.subjectEntityId,
        construct,
        value: normalizedValue.value,
        unit: normalizedValue.unit ?? undefined,
        role: modalityToRole(claim.modality),
        ...claimTemporalFieldsV4ToV3(claim),
        evidenceRefs: claim.evidenceRefs.map(evidenceV4ToV3),
      };
    }),
    conflicts: proposal.conflicts.map((conflict) => ({
      id: conflict.id,
      claimIds: conflict.claimIds,
      kind: conflict.kind,
    })),
    missingInformation: proposal.missingInformation.map((item) => ({
      id: item.id,
      description: item.description,
      ...(optionalNonEmptyString(item.subjectEntityId ?? null)
        ? { subjectEntityId: optionalNonEmptyString(item.subjectEntityId ?? null)! }
        : {}),
      ...(optionalNonEmptyString(item.relatedConstruct ?? null)
        ? { relatedConstruct: optionalNonEmptyString(item.relatedConstruct ?? null)! }
        : {}),
      ...(item.evidenceRefs?.length
        ? { evidenceRefs: item.evidenceRefs.map(evidenceV4ToV3) }
        : {}),
      proposalLineage: item.proposalLineage,
    })),
    ...(voiceProposal ? { voiceProposal } : {}),
    modelMetadata: proposal.modelMetadata,
    proposedAt: proposal.proposedAt,
  };
}
