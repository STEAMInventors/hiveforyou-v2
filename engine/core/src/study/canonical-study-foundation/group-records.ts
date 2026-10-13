import type {
  CanonicalStudyFoundationGroupedRecord,
  CanonicalStudyFoundationProposedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import { buildRecordGroupId } from "./field-key.js";

/** GROUP within a single document only — one group per record instance. */
export function groupRecordsWithinDocuments(
  proposedFields: readonly CanonicalStudyFoundationProposedField[],
): CanonicalStudyFoundationGroupedRecord[] {
  const byRecord = new Map<string, CanonicalStudyFoundationGroupedRecord>();

  for (const field of proposedFields) {
    const recordGroupId = buildRecordGroupId({
      sourceDocumentId: field.sourceDocumentId,
      recordTypeId: field.recordTypeId,
      instanceIndex: field.instanceIndex,
    });
    const existing = byRecord.get(recordGroupId);
    if (existing) {
      existing.fieldKeys.push(field.fieldKey);
      continue;
    }
    byRecord.set(recordGroupId, {
      recordGroupId,
      sourceDocumentId: field.sourceDocumentId,
      recordTypeId: field.recordTypeId,
      instanceIndex: field.instanceIndex,
      fieldKeys: [field.fieldKey],
    });
  }

  const groups = [...byRecord.values()];
  for (const group of groups) {
    group.fieldKeys.sort((a, b) => a.localeCompare(b));
  }
  groups.sort(
    (a, b) =>
      a.sourceDocumentId.localeCompare(b.sourceDocumentId) ||
      a.recordTypeId.localeCompare(b.recordTypeId) ||
      a.instanceIndex - b.instanceIndex,
  );
  return groups;
}
