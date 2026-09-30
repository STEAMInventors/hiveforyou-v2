import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type {
  CanonicalCaseSnapshot,
  CanonicalEvent,
  Conflict,
  ProposedClaim,
  UnresolvedItem,
  ValidatedClaim,
} from "@hiveforyou/shared/case-intelligence/3";
import { CASE_INTELLIGENCE_SCHEMA_V3 } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

function toValidatedClaim(
  claim: ProposedClaim,
  domainId: string,
  studyRunId: string,
): ValidatedClaim {
  return {
    id: claim.id,
    domainId,
    subjectEntityId: claim.subjectEntityId,
    construct: claim.construct,
    value: claim.value,
    unit: claim.unit,
    role: claim.role,
    effectivePeriod: claim.effectivePeriod,
    occurredOn: claim.occurredOn,
    evidenceRefs: claim.evidenceRefs,
    proposalLineage: {
      proposalItemId: claim.id,
      studyRunId,
    },
  };
}

function hasTimeAnchor(claim: ValidatedClaim): boolean {
  return Boolean(
    claim.occurredOn?.trim() ||
      claim.effectivePeriod?.start?.trim() ||
      claim.effectivePeriod?.end?.trim(),
  );
}

function buildEvents(claims: ValidatedClaim[]): CanonicalEvent[] {
  const timed = claims.filter(hasTimeAnchor);
  timed.sort((a, b) => {
    const aKey = a.occurredOn ?? a.effectivePeriod?.start ?? "";
    const bKey = b.occurredOn ?? b.effectivePeriod?.start ?? "";
    return aKey.localeCompare(bKey);
  });
  return timed.map((claim, index) => ({
    id: `event-${claim.id}`,
    claimId: claim.id,
    construct: claim.construct,
    subjectEntityId: claim.subjectEntityId,
    occurredOn: claim.occurredOn,
    effectivePeriod: claim.effectivePeriod,
    evidenceRefs: claim.evidenceRefs,
    timelineOrderHint: index,
  }));
}

function buildChanges(claims: ValidatedClaim[]): CanonicalCaseSnapshot["changes"] {
  const bySubjectConstruct = new Map<string, ValidatedClaim[]>();
  for (const claim of claims) {
    const key = `${claim.subjectEntityId}\0${claim.construct}`;
    const bucket = bySubjectConstruct.get(key) ?? [];
    bucket.push(claim);
    bySubjectConstruct.set(key, bucket);
  }

  const changes: CanonicalCaseSnapshot["changes"] = [];
  for (const group of bySubjectConstruct.values()) {
    if (group.length < 2) {
      continue;
    }
    const ordered = [...group].sort((a, b) => {
      const aKey = a.occurredOn ?? a.effectivePeriod?.start ?? a.id;
      const bKey = b.occurredOn ?? b.effectivePeriod?.start ?? b.id;
      return aKey.localeCompare(bKey);
    });
    for (let index = 1; index < ordered.length; index += 1) {
      const fromClaim = ordered[index - 1]!;
      const toClaim = ordered[index]!;
      changes.push({
        id: `change-${fromClaim.id}-${toClaim.id}`,
        subjectEntityId: fromClaim.subjectEntityId,
        construct: fromClaim.construct,
        fromClaimId: fromClaim.id,
        toClaimId: toClaim.id,
      });
    }
  }
  return changes;
}

function buildConflicts(
  validation: CanonicalStudyValidationResultV3,
  acceptedClaimIds: Set<string>,
): Conflict[] {
  return validation.accepted.conflicts
    .filter((conflict) => conflict.claimIds.every((id) => acceptedClaimIds.has(id)))
    .map((conflict) => ({
      id: conflict.id,
      claimIds: conflict.claimIds,
      kind: conflict.kind,
      subjectEntityId: undefined,
      construct: undefined,
    }));
}

function buildUnresolved(
  validation: CanonicalStudyValidationResultV3,
  conflicts: Conflict[],
): UnresolvedItem[] {
  const items: UnresolvedItem[] = [];

  for (const gap of validation.accepted.missingInformation) {
    items.push({
      id: gap.id,
      kind: "missing_information",
      source: "model_proposal",
      description: gap.description,
      subjectEntityId: gap.subjectEntityId,
      relatedConstruct: gap.relatedConstruct,
      evidenceRefs: gap.evidenceRefs,
      proposalLineage: gap.proposalLineage,
    });
  }

  for (const conflict of conflicts) {
    items.push({
      id: `unresolved-${conflict.id}`,
      kind: "conflict_open",
      source: "conflict",
      relatedClaimIds: conflict.claimIds,
      relatedConstruct: conflict.construct,
      subjectEntityId: conflict.subjectEntityId,
    });
  }

  return items;
}

export function buildCanonicalCaseSnapshot(
  context: CanonicalStudyContext,
  validation: CanonicalStudyValidationResultV3,
  version: number,
): CanonicalCaseSnapshot {
  const validatedClaims = validation.accepted.claims.map((claim) =>
    toValidatedClaim(claim, context.domainId, context.studyRunId),
  );
  const acceptedClaimIds = new Set(validatedClaims.map((claim) => claim.id));
  const conflicts = buildConflicts(validation, acceptedClaimIds);

  return {
    schemaVersion: CASE_INTELLIGENCE_SCHEMA_V3,
    version,
    caseId: context.caseId,
    studyRunId: context.studyRunId,
    createdAt: new Date().toISOString(),
    caseScope: "single_domain",
    domainId: context.domainId,
    domainPackId: context.domainPackId,
    domainPackVersion: context.domainPackVersion,
    entities: validation.accepted.entities,
    claims: validatedClaims,
    events: buildEvents(validatedClaims),
    conflicts,
    changes: buildChanges(validatedClaims),
    unresolved: buildUnresolved(validation, conflicts),
    sourceDocuments: structuredClone(context.sourceDocuments),
    validationResult: validation,
  };
}
