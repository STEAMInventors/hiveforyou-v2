import type {
  CanonicalStudyDocumentLineageEdge,
  CanonicalStudyEntity,
  CanonicalStudyOperativeFieldValue,
  CanonicalStudyOperativeRecord,
  CanonicalStudyOperativeView,
} from "@hiveforyou/shared/canonical-study-artifact";

import { buildContentKey } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveCompositionRules } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

export type ComposeOperativeViewsResult = {
  operativeViews: CanonicalStudyOperativeView[];
  documentLineage: CanonicalStudyDocumentLineageEdge[];
};

function findRecordVersion(
  indexed: IndexedFoundation,
  recordGroupId: string,
): IndexedRecordVersion | null {
  return indexed.recordsByGroupId.get(recordGroupId) ?? null;
}

function buildOperativeRecord(
  entity: CanonicalStudyEntity,
  indexed: IndexedFoundation,
  overlayByField: Map<string, IndexedRecordVersion>,
): CanonicalStudyOperativeRecord {
  const fieldIds = new Set<string>();
  for (const version of entity.recordVersions) {
    for (const fieldId of Object.keys(version.provenanceByFieldKey)) {
      fieldIds.add(fieldId);
    }
  }

  const fields: CanonicalStudyOperativeFieldValue[] = [...fieldIds]
    .sort((a, b) => a.localeCompare(b))
    .map((fieldId) => {
      const overlayVersion = overlayByField.get(`${entity.id}|${fieldId}`);
      if (overlayVersion) {
        const chip = overlayVersion.provenanceByFieldKey[fieldId];
        return {
          fieldId,
          status: "operative" as const,
          provenance: chip ?? null,
          competingProvenance: [],
        };
      }

      const versionsWithField = entity.recordVersions
        .map((version) => ({
          version,
          chip: version.provenanceByFieldKey[fieldId] ?? null,
        }))
        .filter((entry) => entry.chip != null)
        .sort((a, b) => (a.version.orderingDate ?? "").localeCompare(b.version.orderingDate ?? ""));

      if (versionsWithField.length === 0) {
        return {
          fieldId,
          status: "unresolved" as const,
          provenance: null,
          competingProvenance: [],
        };
      }
      if (versionsWithField.length === 1) {
        return {
          fieldId,
          status: "operative" as const,
          provenance: versionsWithField[0]!.chip,
          competingProvenance: [],
        };
      }

      const latest = versionsWithField[versionsWithField.length - 1]!;
      const historical = versionsWithField.slice(0, -1).map((entry) => entry.chip!);
      return {
        fieldId,
        status: "historical" as const,
        provenance: latest.chip,
        competingProvenance: historical,
      };
    });

  return {
    entityId: entity.id,
    recordTypeId: entity.recordTypeId,
    contentKey: entity.contentKey,
    fields,
    sourceRecordGroupIds: entity.recordVersions.map((version) => version.recordGroupId).sort(),
  };
}

export function composeOperativeViews(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
}): ComposeOperativeViewsResult {
  const { indexed, entities } = input;
  const compositionRules = resolveCompositionRules(indexed.pack);
  const documentLineage: CanonicalStudyDocumentLineageEdge[] = [];

  for (const doc of indexed.foundation.documents) {
    if (doc.amendmentLinkStatus === "linked" && doc.amendmentTargetSourceDocumentId) {
      documentLineage.push({
        id: stableId(`amends:${doc.sourceDocumentId}:${doc.amendmentTargetSourceDocumentId}`),
        kind: "amends",
        fromSourceDocumentId: doc.sourceDocumentId,
        toSourceDocumentId: doc.amendmentTargetSourceDocumentId,
        status: "linked",
      });
    } else if (doc.amendmentLinkStatus === "unresolved" && doc.amendsDocumentTypeId) {
      documentLineage.push({
        id: stableId(`amends-unresolved:${doc.sourceDocumentId}`),
        kind: "amends",
        fromSourceDocumentId: doc.sourceDocumentId,
        toSourceDocumentId: "",
        status: "unresolved",
      });
    }
  }

  const baseDocuments = indexed.foundation.documents
    .filter((doc) => {
      const typeSpec = indexed.pack.documentTypes.find((type) => type.id === doc.documentTypeId);
      return typeSpec && !typeSpec.amends;
    })
    .sort((a, b) => a.sortRank - b.sortRank);

  const operativeViews: CanonicalStudyOperativeView[] = [];

  for (const baseDoc of baseDocuments) {
    const baseTypeId = baseDoc.documentTypeId ?? "";
    const applicableRules = compositionRules.filter((rule) => rule.baseDocumentTypeId === baseTypeId);
    const amendmentDocs = indexed.foundation.documents
      .filter(
        (doc) =>
          doc.amendmentLinkStatus === "linked" &&
          doc.amendmentTargetSourceDocumentId === baseDoc.sourceDocumentId,
      )
      .sort((a, b) => a.sortRank - b.sortRank);

    const overlayByField = new Map<string, IndexedRecordVersion>();
    const unresolvedItems: string[] = [];

    if (applicableRules.length === 0 && amendmentDocs.length > 0) {
      unresolvedItems.push("composition_rules_missing_for_amendments");
    }

    for (const amendmentDoc of amendmentDocs) {
      const rule = applicableRules.find((r) => r.amendmentDocumentTypeId === amendmentDoc.documentTypeId);
      if (!rule) {
        unresolvedItems.push(`composition_rule_missing:${amendmentDoc.sourceDocumentId}`);
        continue;
      }

      const changeRecords = indexed.records.filter(
        (record) =>
          record.sourceDocumentId === amendmentDoc.sourceDocumentId &&
          record.recordTypeId === rule.changeRecordTypeId,
      );

      for (const changeRecord of changeRecords) {
        const affectedTypeChip = changeRecord.provenanceByFieldKey[rule.affectedRecordTypeFieldId];
        const affectedRecordTypeId = String(affectedTypeChip?.normalized.normalizedValue ?? "").trim();
        if (!affectedRecordTypeId) {
          unresolvedItems.push(`amendment_target_unresolved:${changeRecord.recordGroupId}`);
          continue;
        }

        const amendmentPayloadRecords = indexed.records.filter(
          (record) =>
            record.sourceDocumentId === amendmentDoc.sourceDocumentId &&
            record.recordTypeId === affectedRecordTypeId,
        );

        for (const payloadRecord of amendmentPayloadRecords) {
          const contentKey = buildContentKey(payloadRecord, indexed.pack).key;
          const targetEntity = entities.find(
            (entity) =>
              entity.recordTypeId === affectedRecordTypeId &&
              entity.contentKey === contentKey &&
              entity.recordVersions.some((version) => version.sourceDocumentId === baseDoc.sourceDocumentId),
          );
          if (!targetEntity) {
            unresolvedItems.push(`amendment_overlay_target_not_found:${payloadRecord.recordGroupId}`);
            continue;
          }

          for (const fieldId of Object.keys(payloadRecord.provenanceByFieldKey)) {
            const slotKey = `${targetEntity.id}|${fieldId}`;
            if (overlayByField.has(slotKey)) {
              unresolvedItems.push(`competing_amendment:${slotKey}`);
              continue;
            }
            overlayByField.set(slotKey, payloadRecord);
          }
        }
      }
    }

    const baseEntities = entities.filter((entity) =>
      entity.recordVersions.some((version) => version.sourceDocumentId === baseDoc.sourceDocumentId),
    );

    const records = baseEntities
      .map((entity) => buildOperativeRecord(entity, indexed, overlayByField))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    operativeViews.push({
      id: stableId(`operative:${baseDoc.sourceDocumentId}`),
      baseDocumentTypeId: baseTypeId,
      baseSourceDocumentId: baseDoc.sourceDocumentId,
      amendmentSourceDocumentIds: amendmentDocs.map((doc) => doc.sourceDocumentId),
      status: unresolvedItems.length > 0 ? "unresolved" : "resolved",
      records,
      unresolvedItems: unresolvedItems.sort(),
    });
  }

  if (operativeViews.length === 0 && entities.length > 0) {
    const records = entities
      .map((entity) => buildOperativeRecord(entity, indexed, new Map()))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));
    operativeViews.push({
      id: stableId("operative:case_fallback"),
      baseDocumentTypeId: "",
      baseSourceDocumentId: "",
      amendmentSourceDocumentIds: [],
      status: "resolved",
      records,
      unresolvedItems: [],
    });
  }

  documentLineage.sort((a, b) => a.id.localeCompare(b.id));
  operativeViews.sort((a, b) => a.id.localeCompare(b.id));
  return { operativeViews, documentLineage };
}
