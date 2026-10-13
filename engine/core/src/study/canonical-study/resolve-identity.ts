import type {
  CanonicalStudyEntity,
  CanonicalStudyOrphanRecord,
  CanonicalStudyPossiblySameLink,
  CanonicalStudyProvenanceChip,
} from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyFoundationUnresolvedItem } from "@hiveforyou/shared/canonical-study-foundation";

import { buildContentKey, valuesEquivalent } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

export type ResolveIdentityResult = {
  entities: CanonicalStudyEntity[];
  possiblySameLinks: CanonicalStudyPossiblySameLink[];
  orphans: CanonicalStudyOrphanRecord[];
  orphanItems: CanonicalStudyFoundationUnresolvedItem[];
};

function recordDef(indexed: IndexedFoundation, recordTypeId: string) {
  return indexed.pack.recordTypes.find((record) => record.id === recordTypeId);
}

function chipsForRecord(record: IndexedRecordVersion): CanonicalStudyProvenanceChip[] {
  return Object.values(record.provenanceByFieldKey).sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

function disambiguatorMaterial(record: IndexedRecordVersion, indexed: IndexedFoundation): string {
  const disambiguators = recordDef(indexed, record.recordTypeId)?.identity?.disambiguators ?? [];
  return disambiguators
    .map((fieldId) => {
      const chip = record.provenanceByFieldKey[fieldId];
      return chip ? `${fieldId}=${String(chip.normalized.normalizedValue ?? "")}` : "";
    })
    .filter(Boolean)
    .join("|");
}

function toEntityRecordVersion(record: IndexedRecordVersion): CanonicalStudyEntity["recordVersions"][0] {
  return {
    recordGroupId: record.recordGroupId,
    sourceDocumentId: record.sourceDocumentId,
    recordTypeId: record.recordTypeId,
    instanceIndex: record.instanceIndex,
    documentTypeId: record.documentTypeId,
    orderingDate: record.orderingDate,
    party: record.party,
    fieldKeys: record.fieldKeys,
    provenanceByFieldKey: record.provenanceByFieldKey,
  };
}

function buildEntity(
  recordTypeId: string,
  versions: IndexedRecordVersion[],
  contentKey: string | null,
  status: CanonicalStudyEntity["status"],
  reasons: string[],
): CanonicalStudyEntity {
  const sortedVersions = versions.slice().sort((a, b) => {
    const rank = a.sortRank - b.sortRank;
    if (rank !== 0) {
      return rank;
    }
    return a.recordGroupId.localeCompare(b.recordGroupId);
  });
  const material = `${recordTypeId}|${contentKey ?? "unresolved"}|${sortedVersions
    .map((v) => v.recordGroupId)
    .sort()
    .join(",")}`;
  return {
    id: stableId(material),
    recordTypeId,
    status,
    contentKey,
    recordVersions: sortedVersions.map(toEntityRecordVersion),
    reasons,
  };
}

function conflictingFieldIds(versions: IndexedRecordVersion[]): string[] {
  const fieldIds = new Set<string>();
  for (const version of versions) {
    for (const fieldId of Object.keys(version.provenanceByFieldKey)) {
      fieldIds.add(fieldId);
    }
  }
  const conflicts: string[] = [];
  for (const fieldId of [...fieldIds].sort((a, b) => a.localeCompare(b))) {
    const values = new Set(
      versions
        .map((version) => version.provenanceByFieldKey[fieldId])
        .filter((chip): chip is CanonicalStudyProvenanceChip => chip != null)
        .map((chip) => JSON.stringify(chip.normalized.normalizedValue)),
    );
    if (values.size > 1) {
      conflicts.push(fieldId);
    }
  }
  return conflicts;
}

function lacksRequiredIdentity(record: IndexedRecordVersion, indexed: IndexedFoundation): boolean {
  const identity = recordDef(indexed, record.recordTypeId)?.identity;
  if (!identity) {
    return true;
  }
  if (identity.scope === "document") {
    return false;
  }
  if ((identity.keyFields ?? []).length === 0) {
    const recordType = recordDef(indexed, record.recordTypeId);
    if (
      identity.scope === "case" &&
      identity.caseSingletonMerge !== "never_auto_merge" &&
      (identity.caseSingletonMerge === "guaranteed_unique" || recordType?.repeatable === false)
    ) {
      return false;
    }
    return identity.caseSingletonMerge !== "guaranteed_unique";
  }
  return buildContentKey(record, indexed.pack).missingRequired.length > 0;
}

function hasSubstantiveValue(record: IndexedRecordVersion): boolean {
  return Object.values(record.provenanceByFieldKey).some((chip) => {
    const value = chip.normalized.normalizedValue;
    return value != null && value !== "";
  });
}

function orphanStatus(
  record: IndexedRecordVersion,
  indexed: IndexedFoundation,
): CanonicalStudyOrphanRecord["status"] {
  const rejected = indexed.foundation.rejectedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex,
  );
  const unresolved = indexed.foundation.unresolvedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex,
  );
  return rejected && !unresolved ? "rejected" : "unresolved";
}

function partitionByOptionalKeys(
  versions: IndexedRecordVersion[],
  indexed: IndexedFoundation,
): IndexedRecordVersion[][] {
  const recordTypeId = versions[0]?.recordTypeId;
  if (!recordTypeId) {
    return [];
  }
  const optionalFields = recordDef(indexed, recordTypeId)?.identity?.keyFieldsIfPresent ?? [];
  if (optionalFields.length === 0) {
    return [versions];
  }

  const presentBoth = versions.filter((version) =>
    optionalFields.every((fieldId) => version.provenanceByFieldKey[fieldId] != null),
  );
  if (presentBoth.length < 2) {
    return [versions];
  }

  const partitions = new Map<string, IndexedRecordVersion[]>();
  for (const version of versions) {
    const material = optionalFields
      .map((fieldId) => {
        const chip = version.provenanceByFieldKey[fieldId];
        return chip ? String(chip.normalized.normalizedValue ?? "") : "__absent__";
      })
      .join("|");
    const list = partitions.get(material) ?? [];
    list.push(version);
    partitions.set(material, list);
  }

  if (partitions.size <= 1) {
    return [versions];
  }
  const values = [...partitions.values()];
  const hasConflict = values.some((group) =>
    group.some((version) =>
      optionalFields.every((fieldId) => version.provenanceByFieldKey[fieldId] != null),
    ),
  );
  return hasConflict ? values : [versions];
}

export function resolveIdentity(indexed: IndexedFoundation): ResolveIdentityResult {
  const entities: CanonicalStudyEntity[] = [];
  const possiblySameLinks: CanonicalStudyPossiblySameLink[] = [];
  const orphans: CanonicalStudyOrphanRecord[] = [];
  const orphanItems: CanonicalStudyFoundationUnresolvedItem[] = [];

  const byRecordType = new Map<string, IndexedRecordVersion[]>();
  for (const record of indexed.records) {
    if (lacksRequiredIdentity(record, indexed) && !hasSubstantiveValue(record)) {
      const orphan: CanonicalStudyOrphanRecord = {
        id: stableId(`orphan:${record.recordGroupId}`),
        recordGroupId: record.recordGroupId,
        sourceDocumentId: record.sourceDocumentId,
        recordTypeId: record.recordTypeId,
        instanceIndex: record.instanceIndex,
        status: orphanStatus(record, indexed),
        reason: "missing_required_identity_and_substantive_value",
        fieldKeys: record.fieldKeys.slice(),
        provenance: chipsForRecord(record),
      };
      orphans.push(orphan);
      orphanItems.push({
        id: `orphan-record:${record.recordGroupId}`,
        kind: "orphan_record",
        message: `Record ${record.recordTypeId} ${record.recordGroupId} is an orphan: required identity and substantive value are both missing.`,
        sourceDocumentId: record.sourceDocumentId,
        recordGroupId: record.recordGroupId,
      });
      continue;
    }
    const list = byRecordType.get(record.recordTypeId) ?? [];
    list.push(record);
    byRecordType.set(record.recordTypeId, list);
  }

  for (const [recordTypeId, allVersions] of [...byRecordType.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const identity = recordDef(indexed, recordTypeId)?.identity;
    const hasKeys = (identity?.keyFields ?? []).length > 0;

    if (!hasKeys) {
      if (identity?.scope === "document") {
        for (const version of allVersions) {
          entities.push(buildEntity(recordTypeId, [version], null, "resolved", ["document_scoped"]));
        }
      } else if (identity?.scope === "case" && identity.caseSingletonMerge === "never_auto_merge") {
        for (const version of allVersions) {
          entities.push(
            buildEntity(recordTypeId, [version], null, "identity_unresolved", [
              "case_singleton_never_auto_merge",
            ]),
          );
        }
      } else if (
        identity?.scope === "case" &&
        (identity.caseSingletonMerge === "guaranteed_unique" ||
          recordDef(indexed, recordTypeId)?.repeatable === false)
      ) {
        const conflicts = conflictingFieldIds(allVersions);
        const reasons =
          identity.caseSingletonMerge === "guaranteed_unique"
            ? ["case_singleton_guaranteed_unique"]
            : ["case_singleton_repeatable_false"];
        if (conflicts.length > 0) {
          reasons.push(`conflicting_fields:${conflicts.join(",")}`);
        }
        entities.push(buildEntity(recordTypeId, allVersions, null, "resolved", reasons));
      } else {
        for (const version of allVersions) {
          entities.push(
            buildEntity(recordTypeId, [version], null, "identity_unresolved", [
              "empty_key_without_guaranteed_unique_merge",
            ]),
          );
        }
      }
      continue;
    }

    const keyed: IndexedRecordVersion[] = [];
    for (const version of allVersions) {
      const keyResult = buildContentKey(version, indexed.pack);
      if (keyResult.missingRequired.length > 0) {
        entities.push(
          buildEntity(recordTypeId, [version], null, "identity_unresolved", ["missing_required_identity_keys"]),
        );
      } else {
        keyed.push(version);
      }
    }

    const byContentKey = new Map<string, IndexedRecordVersion[]>();
    for (const version of keyed) {
      const keyResult = buildContentKey(version, indexed.pack);
      const contentKey = keyResult.key ?? "";
      const list = byContentKey.get(contentKey) ?? [];
      list.push(version);
      byContentKey.set(contentKey, list);
    }

    for (const [contentKey, versionsForKey] of [...byContentKey.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (identity?.crossDocumentMerge === "independent_assertions") {
        for (const version of versionsForKey) {
          entities.push(
            buildEntity(recordTypeId, [version], contentKey, "resolved", ["independent_assertion"]),
          );
        }
        continue;
      }
      const byDocAndDisambiguator = new Map<string, IndexedRecordVersion[]>();
      for (const version of versionsForKey) {
        const bucketKey = `${version.sourceDocumentId}|${disambiguatorMaterial(version, indexed)}`;
        const list = byDocAndDisambiguator.get(bucketKey) ?? [];
        list.push(version);
        byDocAndDisambiguator.set(bucketKey, list);
      }

      for (const docGroup of byDocAndDisambiguator.values()) {
        if (docGroup.length > 1) {
          for (const version of docGroup) {
            entities.push(
              buildEntity(recordTypeId, [version], contentKey, "resolved", ["same_document_duplicate_key"]),
            );
          }
          for (let i = 0; i < docGroup.length; i++) {
            for (let j = i + 1; j < docGroup.length; j++) {
              possiblySameLinks.push({
                id: stableId(`possibly_same:${docGroup[i]!.recordGroupId}:${docGroup[j]!.recordGroupId}`),
                leftEntityId: buildEntity(recordTypeId, [docGroup[i]!], contentKey, "resolved", []).id,
                rightEntityId: buildEntity(recordTypeId, [docGroup[j]!], contentKey, "resolved", []).id,
                recordTypeId,
                reason: "same_document_indistinguishable",
                leftProvenance: chipsForRecord(docGroup[i]!),
                rightProvenance: chipsForRecord(docGroup[j]!),
              });
            }
          }
          continue;
        }
      }

      const crossDocVersions = versionsForKey.filter((version) => {
        const bucketKey = `${version.sourceDocumentId}|${disambiguatorMaterial(version, indexed)}`;
        return (byDocAndDisambiguator.get(bucketKey) ?? []).length === 1;
      });

      for (const partition of partitionByOptionalKeys(crossDocVersions, indexed)) {
        entities.push(buildEntity(recordTypeId, partition, contentKey, "resolved", []));
      }
    }

    const contentKeys = [...byContentKey.keys()];
    const constructId = recordDef(indexed, recordTypeId)?.usesConstructs?.[0];
    for (let i = 0; i < contentKeys.length; i++) {
      for (let j = i + 1; j < contentKeys.length; j++) {
        const leftKey = contentKeys[i]!;
        const rightKey = contentKeys[j]!;
        if (valuesEquivalent(leftKey, rightKey, constructId, indexed.pack) === "possibly_same") {
          const leftSample = byContentKey.get(leftKey)?.[0];
          const rightSample = byContentKey.get(rightKey)?.[0];
          if (!leftSample || !rightSample) {
            continue;
          }
          possiblySameLinks.push({
            id: stableId(`possibly_same:${leftKey}:${rightKey}:${recordTypeId}`),
            leftEntityId: buildEntity(recordTypeId, byContentKey.get(leftKey) ?? [], leftKey, "resolved", []).id,
            rightEntityId: buildEntity(recordTypeId, byContentKey.get(rightKey) ?? [], rightKey, "resolved", []).id,
            recordTypeId,
            reason: "construct_partial_match",
            leftProvenance: chipsForRecord(leftSample),
            rightProvenance: chipsForRecord(rightSample),
          });
        }
      }
    }
  }

  entities.sort((a, b) => a.id.localeCompare(b.id));
  possiblySameLinks.sort((a, b) => a.id.localeCompare(b.id));
  orphans.sort((a, b) => a.id.localeCompare(b.id));
  orphanItems.sort((a, b) => a.id.localeCompare(b.id));
  return { entities, possiblySameLinks, orphans, orphanItems };
}
