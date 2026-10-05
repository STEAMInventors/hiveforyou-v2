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

function mapMissing(
  item: CanonicalCaseSnapshot["unresolved"][number],
  intelligence: CanonicalCaseSnapshot,
): ProposedMissingness | null {
  if (item.kind !== "missing_information") {
    return null;
  }
  let description = item.description ?? "Missing information";
  if (item.source === "extraction" && intelligence.extractionReadiness) {
    for (const doc of intelligence.extractionReadiness.documents) {
      const range = doc.unreadableRanges.find((row) => row.id === item.id);
      if (range) {
        description = `${description} Pro: ${doc.filename} upload pages ${range.sourcePageStart}${range.sourcePageEnd !== range.sourcePageStart ? `–${range.sourcePageEnd}` : ""}; reason codes ${range.reasonCodes.join(", ")}${
          range.logicalDocuments.length
            ? `; logical ${range.logicalDocuments
                .map(
                  (logical) =>
                    `${logical.logicalDocumentId} pages ${logical.pageStart}${logical.pageEnd !== logical.pageStart ? `–${logical.pageEnd}` : ""}`,
                )
                .join("; ")}`
            : ""
        }.`;
        break;
      }
    }
  }
  return {
    id: item.id,
    description,
    relatedDocumentIds: item.evidenceRefs?.map((ref) => ref.sourceDocumentId),
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
      .map((item) => mapMissing(item, intelligence))
      .filter((item): item is ProposedMissingness => item != null),
  };
}
