import type {
  ProposalCaseTimelineEvent,
  ProposalDomainPack,
  ProposalTimelineDateKind,
} from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyDocumentLineageEdge,
  CanonicalStudyEntity,
  CanonicalStudyProvenanceChip,
  CanonicalStudyTimeline,
  CanonicalStudyTimelineDateKind,
  CanonicalStudyTimelineEntry,
  CanonicalStudyTimelineEntryStatus,
  CanonicalStudyTimelineRelationship,
} from "@hiveforyou/shared/canonical-study-artifact";
import type {
  CanonicalStudyDocumentClassificationStatus,
  CanonicalStudyDocumentExtractionStatus,
} from "@hiveforyou/shared/canonical-study-foundation";

import { parsePackFieldPath } from "../canonical-study-foundation/field-key.js";
import { isExtractionReadable } from "./evaluate-source-coverage.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

export type AssembleCaseTimelineDocument = {
  sourceDocumentId: string;
  documentTypeId: string | null;
  extractionStatus: CanonicalStudyDocumentExtractionStatus;
  classificationStatus: CanonicalStudyDocumentClassificationStatus;
};

type TimelineCandidate = {
  eventId: string;
  derivedEventKey: string | null;
  label: string;
  sourceDocumentId: string;
  documentTypeId: string | null;
  recordGroupId: string | null;
  dateKind: CanonicalStudyTimelineDateKind;
  dateFieldPath: string | null;
  sameDateSortKey: number;
  eventEvidence: CanonicalStudyProvenanceChip[];
  dateEvidence: CanonicalStudyProvenanceChip[];
  supportingFactProvenance: CanonicalStudyProvenanceChip[];
  relatedEntityIds: string[];
  extractionStatus: CanonicalStudyDocumentExtractionStatus;
  classificationStatus: CanonicalStudyDocumentClassificationStatus;
  status: CanonicalStudyTimelineEntryStatus;
  sortDate: string | null;
};

function toTimelineDateKind(kind: ProposalTimelineDateKind): CanonicalStudyTimelineDateKind {
  return kind;
}

function isoDateFromChip(chip: CanonicalStudyProvenanceChip | undefined): string | null {
  const value = chip?.normalized.normalizedValue;
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.trim().slice(0, 10);
}

function resolveDatePathForRule(
  pack: ProposalDomainPack,
  rule: ProposalCaseTimelineEvent,
): string | null {
  if (rule.dateFieldPath?.trim()) {
    return rule.dateFieldPath.trim();
  }
  if (!rule.documentTypeId) {
    return null;
  }
  const docType = pack.documentTypes.find((type) => type.id === rule.documentTypeId);
  return docType?.orderingDate?.trim() ?? null;
}

function recordsForDocument(
  indexed: IndexedFoundation,
  sourceDocumentId: string,
  recordTypeId?: string,
): IndexedRecordVersion[] {
  return indexed.records.filter((record) => {
    if (record.sourceDocumentId !== sourceDocumentId) {
      return false;
    }
    if (recordTypeId && record.recordTypeId !== recordTypeId) {
      return false;
    }
    return true;
  });
}

function chipsFromPaths(
  records: IndexedRecordVersion[],
  paths: string[],
): CanonicalStudyProvenanceChip[] {
  const chips: CanonicalStudyProvenanceChip[] = [];
  for (const path of paths) {
    const parsed = parsePackFieldPath(path);
    if (!parsed) {
      continue;
    }
    for (const record of records) {
      if (record.recordTypeId !== parsed.recordTypeId) {
        continue;
      }
      const chip = record.provenanceByFieldKey[parsed.fieldId];
      if (chip) {
        chips.push(chip);
      }
    }
  }
  return chips.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
}

function defaultEventEvidence(
  indexed: IndexedFoundation,
  sourceDocumentId: string,
  recordTypeId: string | undefined,
): CanonicalStudyProvenanceChip[] {
  const records = recordsForDocument(indexed, sourceDocumentId, recordTypeId);
  if (records.length === 0) {
    return [];
  }
  const target =
    records.find((record) => record.recordTypeId === "document_header") ?? records[0]!;
  const preferred = ["title", "document_date", "effective_start", "effective_date"];
  for (const fieldId of preferred) {
    const chip = target.provenanceByFieldKey[fieldId];
    if (chip) {
      return [chip];
    }
  }
  const first = Object.values(target.provenanceByFieldKey).sort((a, b) =>
    a.fieldId.localeCompare(b.fieldId),
  )[0];
  return first ? [first] : [];
}

function resolveDateEvidence(
  records: IndexedRecordVersion[],
  dateFieldPath: string | null,
): { chips: CanonicalStudyProvenanceChip[]; sortDate: string | null; conflict: boolean } {
  if (!dateFieldPath) {
    return { chips: [], sortDate: null, conflict: false };
  }
  const parsed = parsePackFieldPath(dateFieldPath);
  if (!parsed) {
    return { chips: [], sortDate: null, conflict: false };
  }
  const chips = records
    .filter((record) => record.recordTypeId === parsed.recordTypeId)
    .map((record) => record.provenanceByFieldKey[parsed.fieldId])
    .filter((chip): chip is CanonicalStudyProvenanceChip => chip != null);
  const dates = [...new Set(chips.map((chip) => isoDateFromChip(chip)).filter(Boolean))] as string[];
  if (dates.length > 1) {
    return { chips, sortDate: null, conflict: true };
  }
  return { chips, sortDate: dates[0] ?? null, conflict: false };
}

function relatedEntities(
  entities: CanonicalStudyEntity[],
  sourceDocumentId: string,
  recordGroupId: string | null,
): string[] {
  const ids = new Set<string>();
  for (const entity of entities) {
    for (const version of entity.recordVersions) {
      if (version.sourceDocumentId !== sourceDocumentId) {
        continue;
      }
      if (recordGroupId && version.recordGroupId !== recordGroupId) {
        continue;
      }
      ids.add(entity.id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function dedupKey(candidate: TimelineCandidate): string {
  return [
    candidate.eventId,
    candidate.derivedEventKey ?? "",
    candidate.sourceDocumentId,
    candidate.recordGroupId ?? "",
    candidate.sortDate ?? "",
    candidate.dateFieldPath ?? "",
  ].join("|");
}

function mergeCandidates(existing: TimelineCandidate, incoming: TimelineCandidate): TimelineCandidate {
  const eventEvidence = [...existing.eventEvidence, ...incoming.eventEvidence].filter(
    (chip, index, list) => list.findIndex((row) => row.fieldKey === chip.fieldKey) === index,
  );
  const dateEvidence = [...existing.dateEvidence, ...incoming.dateEvidence].filter(
    (chip, index, list) => list.findIndex((row) => row.fieldKey === chip.fieldKey) === index,
  );
  return {
    ...existing,
    eventEvidence,
    dateEvidence,
    supportingFactProvenance: [
      ...existing.supportingFactProvenance,
      ...incoming.supportingFactProvenance,
    ].filter(
      (chip, index, list) => list.findIndex((row) => row.fieldKey === chip.fieldKey) === index,
    ),
    relatedEntityIds: [...new Set([...existing.relatedEntityIds, ...incoming.relatedEntityIds])].sort(
      (a, b) => a.localeCompare(b),
    ),
    status:
      existing.status === "date_conflict" || incoming.status === "date_conflict"
        ? "date_conflict"
        : existing.status,
  };
}

function candidateFromRule(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
  rule: ProposalCaseTimelineEvent;
  doc: AssembleCaseTimelineDocument;
}): TimelineCandidate[] {
  const { indexed, entities, rule, doc } = input;
  const dateFieldPath = resolveDatePathForRule(indexed.pack, rule);
  const sameDateSortKey = rule.sameDateSortKey ?? Number.MAX_SAFE_INTEGER;

  if (!isExtractionReadable(doc.extractionStatus)) {
    return [
      {
        eventId: rule.id,
        derivedEventKey: null,
        label: rule.label,
        sourceDocumentId: doc.sourceDocumentId,
        documentTypeId: doc.documentTypeId,
        recordGroupId: null,
        dateKind: toTimelineDateKind(rule.dateKind),
        dateFieldPath,
        sameDateSortKey,
        eventEvidence: [],
        dateEvidence: [],
        supportingFactProvenance: [],
        relatedEntityIds: relatedEntities(entities, doc.sourceDocumentId, null),
        extractionStatus: doc.extractionStatus,
        classificationStatus: doc.classificationStatus,
        status: "incomplete_extraction",
        sortDate: null,
      },
    ];
  }

  const recordGroups = rule.recordTypeId
    ? recordsForDocument(indexed, doc.sourceDocumentId, rule.recordTypeId)
    : [recordsForDocument(indexed, doc.sourceDocumentId)[0]].filter(Boolean);

  if (recordGroups.length === 0 && rule.recordTypeId) {
    return [];
  }

  const targets =
    rule.recordTypeId && recordGroups.length > 0
      ? recordGroups
      : recordsForDocument(indexed, doc.sourceDocumentId).length > 0
        ? [recordsForDocument(indexed, doc.sourceDocumentId)[0]!]
        : [];

  if (targets.length === 0) {
    return [];
  }

  return targets.map((record) => {
    const scopeRecords = rule.recordTypeId
      ? recordsForDocument(indexed, doc.sourceDocumentId, rule.recordTypeId)
      : recordsForDocument(indexed, doc.sourceDocumentId);

    const eventEvidence =
      rule.eventEvidenceFieldPaths && rule.eventEvidenceFieldPaths.length > 0
        ? chipsFromPaths(scopeRecords, rule.eventEvidenceFieldPaths)
        : defaultEventEvidence(indexed, doc.sourceDocumentId, rule.recordTypeId);

    const { chips: dateEvidence, sortDate, conflict } = resolveDateEvidence(
      scopeRecords,
      dateFieldPath,
    );

    let status: CanonicalStudyTimelineEntryStatus = "verified";
    if (conflict) {
      status = "date_conflict";
    } else if (eventEvidence.length === 0) {
      status = "missing_date";
    } else if (!sortDate) {
      status = "missing_date";
    } else {
      status = "verified";
    }

    const supportingFactProvenance = scopeRecords
      .flatMap((row) => Object.values(row.provenanceByFieldKey))
      .filter(
        (chip) =>
          !eventEvidence.some((ev) => ev.fieldKey === chip.fieldKey) &&
          !dateEvidence.some((ev) => ev.fieldKey === chip.fieldKey),
      )
      .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

    return {
      eventId: rule.id,
      derivedEventKey: null,
      label: rule.label,
      sourceDocumentId: doc.sourceDocumentId,
      documentTypeId: doc.documentTypeId,
      recordGroupId: record.recordGroupId,
      dateKind: toTimelineDateKind(rule.dateKind),
      dateFieldPath,
      sameDateSortKey,
      eventEvidence,
      dateEvidence,
      supportingFactProvenance,
      relatedEntityIds: relatedEntities(entities, doc.sourceDocumentId, record.recordGroupId),
      extractionStatus: doc.extractionStatus,
      classificationStatus: doc.classificationStatus,
      status,
      sortDate: status === "verified" ? sortDate : null,
    };
  });
}

function candidatesFromEventFields(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
  documents: AssembleCaseTimelineDocument[];
}): TimelineCandidate[] {
  const { indexed, entities, documents } = input;
  const docById = new Map(documents.map((doc) => [doc.sourceDocumentId, doc]));
  const out: TimelineCandidate[] = [];

  for (const recordType of indexed.pack.recordTypes) {
    for (const field of recordType.fields) {
      if (field.comparison !== "event") {
        continue;
      }
      for (const record of indexed.records) {
        if (record.recordTypeId !== recordType.id) {
          continue;
        }
        const chip = record.provenanceByFieldKey[field.id];
        if (!chip) {
          continue;
        }
        const doc = docById.get(record.sourceDocumentId);
        if (!doc || !isExtractionReadable(doc.extractionStatus)) {
          continue;
        }
        const sortDate = isoDateFromChip(chip);
        out.push({
          eventId: `derived:${recordType.id}.${field.id}`,
          derivedEventKey: `${recordType.id}.${field.id}`,
          label: `${recordType.id}.${field.id}`,
          sourceDocumentId: record.sourceDocumentId,
          documentTypeId: doc.documentTypeId,
          recordGroupId: record.recordGroupId,
          dateKind: "event_date",
          dateFieldPath: `${recordType.id}.${field.id}`,
          sameDateSortKey: Number.MAX_SAFE_INTEGER,
          eventEvidence: [chip],
          dateEvidence: [chip],
          supportingFactProvenance: [],
          relatedEntityIds: relatedEntities(entities, record.sourceDocumentId, record.recordGroupId),
          extractionStatus: doc.extractionStatus,
          classificationStatus: doc.classificationStatus,
          status: sortDate ? "verified" : "missing_date",
          sortDate,
        });
      }
    }
  }

  return out;
}

function documentsForRule(
  documents: AssembleCaseTimelineDocument[],
  rule: ProposalCaseTimelineEvent,
): AssembleCaseTimelineDocument[] {
  if (!rule.documentTypeId) {
    return documents;
  }
  return documents.filter((doc) => doc.documentTypeId === rule.documentTypeId);
}

function finalizeEntry(candidate: TimelineCandidate): CanonicalStudyTimelineEntry {
  return {
    entryId: stableId(
      [
        candidate.eventId,
        candidate.derivedEventKey ?? "",
        candidate.sourceDocumentId,
        candidate.recordGroupId ?? "",
        candidate.dateFieldPath ?? "",
        candidate.sortDate ?? "",
      ].join(":"),
    ),
    eventId: candidate.eventId,
    label: candidate.label,
    status: candidate.status,
    sortDate: candidate.sortDate,
    dateKind: candidate.dateKind,
    dateFieldPath: candidate.dateFieldPath,
    sourceDocumentId: candidate.sourceDocumentId,
    documentTypeId: candidate.documentTypeId,
    recordGroupId: candidate.recordGroupId,
    eventEvidence: candidate.eventEvidence,
    dateEvidence: candidate.dateEvidence,
    supportingFactProvenance: candidate.supportingFactProvenance,
    relatedEntityIds: candidate.relatedEntityIds,
    extractionStatus: candidate.extractionStatus,
    classificationStatus: candidate.classificationStatus,
    sameDateSortKey: candidate.sameDateSortKey,
  };
}

function compareEntries(a: CanonicalStudyTimelineEntry, b: CanonicalStudyTimelineEntry): number {
  const ad = a.sortDate ?? "";
  const bd = b.sortDate ?? "";
  if (ad !== bd) {
    return ad.localeCompare(bd);
  }
  if (a.sameDateSortKey !== b.sameDateSortKey) {
    return a.sameDateSortKey - b.sameDateSortKey;
  }
  return a.entryId.localeCompare(b.entryId);
}

function buildRelationships(
  documentLineage: CanonicalStudyDocumentLineageEdge[],
): CanonicalStudyTimelineRelationship[] {
  return documentLineage
    .filter((edge) => edge.status === "linked" && edge.toSourceDocumentId.trim())
    .map((edge) => ({
      id: stableId(`timeline-rel:${edge.id}`),
      kind: edge.kind,
      fromSourceDocumentId: edge.fromSourceDocumentId,
      toSourceDocumentId: edge.toSourceDocumentId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function assembleCaseTimeline(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
  documentLineage: CanonicalStudyDocumentLineageEdge[];
  documents: AssembleCaseTimelineDocument[];
}): CanonicalStudyTimeline {
  const packRules = input.indexed.pack.caseTimeline?.events ?? [];
  const rawCandidates: TimelineCandidate[] = [];

  for (const rule of packRules) {
    for (const doc of documentsForRule(input.documents, rule)) {
      rawCandidates.push(...candidateFromRule({ ...input, rule, doc }));
    }
  }

  rawCandidates.push(...candidatesFromEventFields(input));

  const withoutDerivedDuplicates = rawCandidates.filter((candidate) => {
    if (!candidate.derivedEventKey) {
      return true;
    }
    return !rawCandidates.some(
      (other) =>
        !other.derivedEventKey &&
        other.sourceDocumentId === candidate.sourceDocumentId &&
        other.sortDate === candidate.sortDate &&
        (other.dateFieldPath === candidate.dateFieldPath ||
          (other.recordGroupId != null &&
            other.recordGroupId === candidate.recordGroupId)),
    );
  });

  const byDedup = new Map<string, TimelineCandidate>();
  for (const candidate of withoutDerivedDuplicates) {
    const key = dedupKey(candidate);
    const existing = byDedup.get(key);
    if (existing) {
      if (candidate.derivedEventKey && !existing.derivedEventKey) {
        continue;
      }
      if (!candidate.derivedEventKey && existing.derivedEventKey) {
        byDedup.set(key, candidate);
        continue;
      }
      byDedup.set(key, mergeCandidates(existing, candidate));
      continue;
    }
    byDedup.set(key, candidate);
  }

  const dated: CanonicalStudyTimelineEntry[] = [];
  const dateUnknown: CanonicalStudyTimelineEntry[] = [];
  const incomplete: CanonicalStudyTimelineEntry[] = [];

  for (const candidate of byDedup.values()) {
    const entry = finalizeEntry(candidate);
    if (entry.status === "incomplete_extraction") {
      incomplete.push(entry);
    } else if (entry.status === "verified" && entry.sortDate) {
      dated.push(entry);
    } else {
      dateUnknown.push(entry);
    }
  }

  dated.sort(compareEntries);
  dateUnknown.sort((a, b) => a.entryId.localeCompare(b.entryId));
  incomplete.sort((a, b) => a.entryId.localeCompare(b.entryId));

  return {
    dated,
    dateUnknown,
    incomplete,
    relationships: buildRelationships(input.documentLineage),
  };
}
