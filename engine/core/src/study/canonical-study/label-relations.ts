import type {
  CanonicalStudyEntity,
  CanonicalStudyProvenanceChip,
  CanonicalStudyRelation,
  CanonicalStudyUnresolvedComparison,
} from "@hiveforyou/shared/canonical-study-artifact";

import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveRelationshipRules } from "./indexed-foundation.js";
import { hasVerifiedTemporalSuccession } from "./temporal-succession.js";
import { stableId } from "./stable-id.js";

export type LabelRelationsResult = {
  relations: CanonicalStudyRelation[];
  unresolvedComparisons: CanonicalStudyUnresolvedComparison[];
};

function valuesEqual(left: CanonicalStudyProvenanceChip, right: CanonicalStudyProvenanceChip): boolean {
  return JSON.stringify(left.normalized.normalizedValue) === JSON.stringify(right.normalized.normalizedValue);
}

function findIndexedVersion(
  indexed: IndexedFoundation,
  chip: CanonicalStudyProvenanceChip,
): IndexedRecordVersion | null {
  return (
    indexed.records.find(
      (record) =>
        record.sourceDocumentId === chip.sourceDocumentId &&
        record.recordTypeId === chip.recordTypeId &&
        record.instanceIndex === chip.instanceIndex,
    ) ?? null
  );
}

export function labelRelations(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
}): LabelRelationsResult {
  const { indexed, entities } = input;
  const rules = resolveRelationshipRules(indexed.pack);
  const relations: CanonicalStudyRelation[] = [];
  const unresolvedComparisons: CanonicalStudyUnresolvedComparison[] = [];

  for (const entity of entities) {
    if (entity.status === "identity_unresolved") {
      continue;
    }

    const fieldIds = new Set<string>();
    for (const version of entity.recordVersions) {
      for (const fieldId of Object.keys(version.provenanceByFieldKey)) {
        fieldIds.add(fieldId);
      }
    }

    for (const fieldId of [...fieldIds].sort()) {
      const chips = entity.recordVersions
        .map((version) => version.provenanceByFieldKey[fieldId])
        .filter((chip): chip is CanonicalStudyProvenanceChip => chip != null)
        .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

      for (let i = 0; i < chips.length; i++) {
        for (let j = i + 1; j < chips.length; j++) {
          const left = chips[i]!;
          const right = chips[j]!;
          const leftVersion = findIndexedVersion(indexed, left);
          const rightVersion = findIndexedVersion(indexed, right);
          if (!leftVersion || !rightVersion) {
            unresolvedComparisons.push({
              id: stableId(`unresolved:${entity.id}:${fieldId}:${left.fieldKey}:${right.fieldKey}`),
              entityId: entity.id,
              fieldId,
              left,
              right,
              reason: "record_version_not_indexed",
            });
            continue;
          }

          if (valuesEqual(left, right)) {
            if (left.sourceDocumentId === right.sourceDocumentId) {
              continue;
            }
            relations.push({
              id: stableId(`rel:unchanged:${left.fieldKey}:${right.fieldKey}`),
              label: "UNCHANGED",
              entityId: entity.id,
              fieldId,
              left,
              right,
              temporalBasis: null,
              partyBasis: null,
            });
            continue;
          }

          const leftParty = leftVersion.party;
          const rightParty = rightVersion.party;
          const partiesDiffer =
            rules.conflictWhenDifferentParties &&
            leftParty &&
            rightParty &&
            leftParty !== rightParty;

          const earlier =
            (leftVersion.orderingDate ?? "") <= (rightVersion.orderingDate ?? "") ? leftVersion : rightVersion;
          const later = earlier === leftVersion ? rightVersion : leftVersion;
          const earlierChip = earlier === leftVersion ? left : right;
          const laterChip = later === leftVersion ? right : left;
          const succession = hasVerifiedTemporalSuccession(earlier, later, indexed);

          if (partiesDiffer) {
            relations.push({
              id: stableId(`rel:conflict:${left.fieldKey}:${right.fieldKey}`),
              label: "CONFLICT",
              entityId: entity.id,
              fieldId,
              left,
              right,
              temporalBasis: succession.basis,
              partyBasis: `${leftParty}|${rightParty}`,
            });
            continue;
          }

          if (succession.ok) {
            relations.push({
              id: stableId(`rel:change:${earlierChip.fieldKey}:${laterChip.fieldKey}`),
              label: "CHANGE",
              entityId: entity.id,
              fieldId,
              left: earlierChip,
              right: laterChip,
              temporalBasis: succession.basis,
              partyBasis: leftParty && rightParty ? `${leftParty}|${rightParty}` : null,
            });
            continue;
          }

          if (left.sourceDocumentId !== right.sourceDocumentId) {
            unresolvedComparisons.push({
              id: stableId(`unresolved:${entity.id}:${fieldId}:${left.fieldKey}:${right.fieldKey}`),
              entityId: entity.id,
              fieldId,
              left,
              right,
              reason: "insufficient_temporal_or_party_context_for_change",
            });
          }
        }
      }
    }
  }

  relations.sort((a, b) => a.id.localeCompare(b.id));
  unresolvedComparisons.sort((a, b) => a.id.localeCompare(b.id));
  return { relations, unresolvedComparisons };
}
