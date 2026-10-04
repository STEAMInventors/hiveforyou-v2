import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type {
  ProposedClaim,
  ProposedConflict,
  ProposedEntity,
  ProposedEvent,
  ProposedMissingness,
} from "@hiveforyou/shared/canonical-study";
import { PRO_VIEW_SCHEMA, type ProView } from "@hiveforyou/shared/projections";

import { formatValidatedClaimSentence, humanizeConstruct } from "./format-v3-claim";

function mapEntity(entity: CanonicalCaseSnapshot["entities"][number]): ProposedEntity {
  return {
    id: entity.id,
    entityType: entity.entityType,
    label: entity.label,
    sourceDocumentIds: entity.evidenceRefs.map((ref) => ref.sourceDocumentId),
  };
}

function mapClaim(
  claim: CanonicalCaseSnapshot["claims"][number],
  entitiesById: Map<string, CanonicalCaseSnapshot["entities"][number]>,
): ProposedClaim {
  return {
    id: claim.id,
    claimType: humanizeConstruct(claim.construct),
    subjectEntityId: claim.subjectEntityId,
    statement: formatValidatedClaimSentence(claim, entitiesById),
    isFactual: true,
    temporalKind: claim.role,
    evidenceRefs: claim.evidenceRefs,
  };
}

function mapEvent(event: CanonicalCaseSnapshot["events"][number]): ProposedEvent {
  return {
    id: event.id,
    eventType: humanizeConstruct(event.construct),
    label: humanizeConstruct(event.construct),
    occurredOn: event.occurredOn ?? event.effectivePeriod?.start,
    entityIds: [event.subjectEntityId],
    evidenceRefs: event.evidenceRefs,
  };
}

function mapConflict(conflict: CanonicalCaseSnapshot["conflicts"][number]): ProposedConflict {
  return {
    id: conflict.id,
    claimIds: conflict.claimIds,
    description: `Conflict (${conflict.kind})`,
    severity: "material",
  };
}

function mapMissing(item: CanonicalCaseSnapshot["unresolved"][number]): ProposedMissingness | null {
  if (item.kind !== "missing_information") {
    return null;
  }
  return {
    id: item.id,
    description: item.description ?? "Missing information",
    subjectEntityId: item.subjectEntityId,
    evidenceRefs: item.evidenceRefs,
  };
}

export function projectProViewV3(intelligence: CanonicalCaseSnapshot): ProView {
  const entitiesById = new Map(intelligence.entities.map((entity) => [entity.id, entity]));
  const claims = intelligence.claims.map((claim) => mapClaim(claim, entitiesById));
  const claimEvidence = intelligence.claims.flatMap((claim) =>
    claim.evidenceRefs.map((ref) => ({ ...ref, claimId: claim.id })),
  );

  return {
    schemaVersion: PRO_VIEW_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    domainIds: [intelligence.domainId],
    entities: intelligence.entities.map(mapEntity),
    claims,
    claimEvidence,
    relationships: [],
    events: intelligence.events.map(mapEvent),
    conflicts: intelligence.conflicts.map(mapConflict),
    missingness: intelligence.unresolved
      .map(mapMissing)
      .filter((item): item is ProposedMissingness => item != null),
  };
}
