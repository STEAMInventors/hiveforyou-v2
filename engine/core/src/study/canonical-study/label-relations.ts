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

function fieldComparison(
  indexed: IndexedFoundation,
  recordTypeId: string,
  fieldId: string,
): "none" | "value" | "event" {
  const field = indexed.pack.recordTypes
    .find((record) => record.id === recordTypeId)
    ?.fields.find((item) => item.id === fieldId);
  return field?.comparison ?? "value";
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
      const comparison = fieldComparison(indexed, entity.recordTypeId, fieldId);
      if (comparison === "none") {
        continue;
      }
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

          const samePeriod =
            comparison === "event" &&
            leftVersion.orderingDate != null &&
            leftVersion.orderingDate === rightVersion.orderingDate;
          if (samePeriod && !valuesEqual(left, right)) {
            unresolvedComparisons.push({
              id: stableId(`unresolved:${entity.id}:${fieldId}:${left.fieldKey}:${right.fieldKey}`),
              entityId: entity.id,
              fieldId,
              left,
              right,
              reason: "same_period_independent_event",
            });
            continue;
          }

          if (valuesEqual(left, right)) {
            if (left.sourceDocumentId === right.sourceDocumentId) {
              continue;
            }
            const earlierVersion =
              (leftVersion.orderingDate ?? "") <= (rightVersion.orderingDate ?? "")
                ? leftVersion
                : rightVersion;
            const laterVersion = earlierVersion === leftVersion ? rightVersion : leftVersion;
            const earlierChip = earlierVersion === leftVersion ? left : right;
            const laterChip = laterVersion === leftVersion ? right : left;
            const succession = hasVerifiedTemporalSuccession(earlierVersion, laterVersion, indexed);
            const label = succession.ok ? "UNCHANGED" : "MATCHES";
            relations.push({
              id: stableId(`rel:${label.toLowerCase()}:${left.fieldKey}:${right.fieldKey}`),
              label,
              entityId: entity.id,
              fieldId,
              left: label === "UNCHANGED" ? earlierChip : left,
              right: label === "UNCHANGED" ? laterChip : right,
              temporalBasis: succession.ok ? succession.basis : null,
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

  labelIndependentAssertions({ indexed, entities, relations });

  relations.sort((a, b) => a.id.localeCompare(b.id));
  unresolvedComparisons.sort((a, b) => a.id.localeCompare(b.id));
  return { relations, unresolvedComparisons };
}

function labelIndependentAssertions(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
  relations: CanonicalStudyRelation[];
}): void {
  const groups = new Map<string, CanonicalStudyEntity[]>();
  for (const entity of input.entities) {
    if (!entity.reasons.includes("independent_assertion") || !entity.contentKey) {
      continue;
    }
    const key = `${entity.recordTypeId}|${entity.contentKey}`;
    const list = groups.get(key) ?? [];
    list.push(entity);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const leftEntity = sorted[i]!;
        const rightEntity = sorted[j]!;
        const leftVersion = leftEntity.recordVersions[0];
        const rightVersion = rightEntity.recordVersions[0];
        if (!leftVersion || !rightVersion) {
          continue;
        }
        const fieldIds = Object.keys(leftVersion.provenanceByFieldKey)
          .filter((fieldId) => fieldComparison(input.indexed, leftEntity.recordTypeId, fieldId) === "value")
          .filter((fieldId) => rightVersion.provenanceByFieldKey[fieldId] != null)
          .sort((a, b) => a.localeCompare(b));
        for (const fieldId of fieldIds) {
          const left = leftVersion.provenanceByFieldKey[fieldId]!;
          const right = rightVersion.provenanceByFieldKey[fieldId]!;
          if (!valuesEqual(left, right)) {
            continue;
          }
          input.relations.push({
            id: stableId(`rel:matches:${left.fieldKey}:${right.fieldKey}`),
            label: "MATCHES",
            entityId: leftEntity.id,
            fieldId,
            left,
            right,
            temporalBasis: null,
            partyBasis: null,
          });
        }
      }
    }
  }
}
