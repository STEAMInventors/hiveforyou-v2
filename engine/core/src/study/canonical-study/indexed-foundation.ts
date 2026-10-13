import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFoundationArtifact,
  CanonicalStudyFoundationGroupedRecord,
  CanonicalStudyFoundationVerifiedField,
} from "@hiveforyou/shared/canonical-study-foundation";
import type {
  CanonicalStudyProvenanceChip,
  CanonicalStudySourceContext,
} from "@hiveforyou/shared/canonical-study-artifact";

export type IndexedRecordVersion = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  documentTypeId: string | null;
  orderingDate: string | null;
  sortRank: number;
  party: string | null;
  fieldKeys: string[];
  provenanceByFieldKey: Record<string, CanonicalStudyProvenanceChip>;
};

export type IndexedFoundation = {
  pack: ProposalDomainPack;
  foundation: CanonicalStudyFoundationArtifact;
  sourceContext: CanonicalStudySourceContext;
  verifiedByFieldKey: Map<string, CanonicalStudyFoundationVerifiedField>;
  records: IndexedRecordVersion[];
  recordsByGroupId: Map<string, IndexedRecordVersion>;
  documentTypeBySource: Map<string, string | null>;
  orderingBySource: Map<
    string,
    { orderingDate: string | null; sortRank: number; party: string | null; documentTypeId: string | null }
  >;
};

function toProvenanceChip(field: CanonicalStudyFoundationVerifiedField): CanonicalStudyProvenanceChip {
  return {
    fieldKey: field.fieldKey,
    recordGroupId: "",
    sourceDocumentId: field.sourceDocumentId,
    recordTypeId: field.recordTypeId,
    instanceIndex: field.instanceIndex,
    fieldId: field.fieldId,
    evidence: field.verifiedEvidence,
    normalized: field.normalized,
    envelopeRef: field.envelopeRef,
  };
}

function buildRecords(input: {
  foundation: CanonicalStudyFoundationArtifact;
  verifiedByFieldKey: Map<string, CanonicalStudyFoundationVerifiedField>;
  groupById: Map<string, CanonicalStudyFoundationGroupedRecord>;
  orderingBySource: IndexedFoundation["orderingBySource"];
  documentTypeBySource: Map<string, string | null>;
}): IndexedRecordVersion[] {
  const fieldsByRecord = new Map<string, CanonicalStudyFoundationVerifiedField[]>();
  for (const field of input.foundation.verifiedFields) {
    const group = [...input.groupById.values()].find(
      (g) =>
        g.sourceDocumentId === field.sourceDocumentId &&
        g.recordTypeId === field.recordTypeId &&
        g.instanceIndex === field.instanceIndex,
    );
    const groupId = group?.recordGroupId ?? `${field.sourceDocumentId}|${field.recordTypeId}|${field.instanceIndex}`;
    const list = fieldsByRecord.get(groupId) ?? [];
    list.push(field);
    fieldsByRecord.set(groupId, list);
  }

  const records: IndexedRecordVersion[] = [];
  for (const group of input.foundation.groupedRecords) {
    const fields = fieldsByRecord.get(group.recordGroupId) ?? [];
    const ordering = input.orderingBySource.get(group.sourceDocumentId);
    const provenanceByFieldKey: Record<string, CanonicalStudyProvenanceChip> = {};
    for (const field of fields) {
      provenanceByFieldKey[field.fieldId] = {
        ...toProvenanceChip(field),
        recordGroupId: group.recordGroupId,
      };
    }
    records.push({
      recordGroupId: group.recordGroupId,
      sourceDocumentId: group.sourceDocumentId,
      recordTypeId: group.recordTypeId,
      instanceIndex: group.instanceIndex,
      documentTypeId: input.documentTypeBySource.get(group.sourceDocumentId) ?? null,
      orderingDate: ordering?.orderingDate ?? null,
      sortRank: ordering?.sortRank ?? 9999,
      party: ordering?.party ?? null,
      fieldKeys: group.fieldKeys.slice().sort((a, b) => a.localeCompare(b)),
      provenanceByFieldKey,
    });
  }

  records.sort((a, b) => {
    const doc = a.sortRank - b.sortRank;
    if (doc !== 0) {
      return doc;
    }
    const typeCmp = a.recordTypeId.localeCompare(b.recordTypeId);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    return a.instanceIndex - b.instanceIndex;
  });
  return records;
}

export function buildIndexedFoundation(input: {
  pack: ProposalDomainPack;
  foundation: CanonicalStudyFoundationArtifact;
  sourceContext: CanonicalStudySourceContext;
}): IndexedFoundation {
  const verifiedByFieldKey = new Map(
    input.foundation.verifiedFields.map((field) => [field.fieldKey, field] as const),
  );
  const groupById = new Map(
    input.foundation.groupedRecords.map((group) => [group.recordGroupId, group] as const),
  );
  const documentTypeBySource = new Map(
    input.foundation.documents.map((doc) => [doc.sourceDocumentId, doc.documentTypeId] as const),
  );
  const orderingBySource = new Map(
    input.foundation.documents.map((doc) => [
      doc.sourceDocumentId,
      {
        orderingDate: doc.verifiedOrderingDate,
        sortRank: doc.sortRank,
        party: doc.party,
        documentTypeId: doc.documentTypeId,
      },
    ] as const),
  );

  const records = buildRecords({
    foundation: input.foundation,
    verifiedByFieldKey,
    groupById,
    orderingBySource,
    documentTypeBySource,
  });

  return {
    pack: input.pack,
    foundation: input.foundation,
    sourceContext: input.sourceContext,
    verifiedByFieldKey,
    records,
    recordsByGroupId: new Map(records.map((record) => [record.recordGroupId, record] as const)),
    documentTypeBySource,
    orderingBySource,
  };
}

export function resolveCompositionRules(pack: ProposalDomainPack) {
  const fromPack = pack.compositionRules ?? [];
  const fromRecords: typeof fromPack = [];
  for (const recordType of pack.recordTypes) {
    if (recordType.composition?.role !== "amendment_change") {
      continue;
    }
    for (const docType of pack.documentTypes) {
      if (!docType.amends || !docType.checklist.includes(recordType.id)) {
        continue;
      }
      fromRecords.push({
        id: `derived:${docType.id}:${recordType.id}`,
        amendmentDocumentTypeId: docType.id,
        baseDocumentTypeId: docType.amends,
        changeRecordTypeId: recordType.id,
        affectedRecordTypeFieldId: recordType.composition.affectedRecordTypeFieldId,
        amendmentTargetDateFieldId: recordType.composition.amendmentTargetDateFieldId,
        overlayMode: recordType.composition.overlayMode,
      });
    }
  }
  const merged = [...fromPack];
  for (const rule of fromRecords) {
    if (!merged.some((existing) => existing.id === rule.id)) {
      merged.push(rule);
    }
  }
  return merged.sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveRelationshipRules(pack: ProposalDomainPack) {
  return {
    changeRequiresTemporalSuccession: pack.relationshipRules?.changeRequiresTemporalSuccession ?? true,
    temporalSuccessionFieldIds: pack.relationshipRules?.temporalSuccessionFieldIds ?? [],
    conflictWhenDifferentParties: pack.relationshipRules?.conflictWhenDifferentParties ?? true,
  };
}
