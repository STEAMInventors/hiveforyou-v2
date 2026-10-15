import { createHash } from "node:crypto";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";

import type {
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationFieldOutcome,
  CanonicalStudyFoundationGroupedRecord,
  CanonicalStudyFoundationUnresolvedItem,
  CanonicalStudyFoundationVerifiedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import { buildRecordGroupId } from "./field-key.js";

export type SourceOccurrenceAnchorBasis =
  | "verified_word_span"
  | "verified_page_quote"
  | "proposed_page_quote"
  | "field_fingerprint_fallback"
  | "pack_anchor_fields";

export type SourceOccurrenceAssignment = {
  sourceOccurrenceId: string;
  anchorBasis: SourceOccurrenceAnchorBasis;
};

export type AssignSourceOccurrenceIdsResult = {
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  unstableOccurrenceItems: CanonicalStudyFoundationUnresolvedItem[];
};

type RecordFieldSlice = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fields: CanonicalStudyFoundationFieldOutcome[];
};

function stableId16(material: string): string {
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

function quoteDigest(quote: string): string {
  return createHash("sha256").update(quote.trim()).digest("hex").slice(0, 12);
}

function evidenceCandidates(
  field: CanonicalStudyFoundationFieldOutcome,
  preferVerified: boolean,
): CanonicalStudyFoundationEvidence[] {
  if (field.disposition === "verified") {
    return field.verifiedEvidence.slice();
  }
  if (!preferVerified && field.evidence) {
    return [field.evidence];
  }
  return [];
}

function pickPrimaryEvidence(
  fields: CanonicalStudyFoundationFieldOutcome[],
): { evidence: CanonicalStudyFoundationEvidence; basis: SourceOccurrenceAnchorBasis } | null {
  type Ranked = {
    evidence: CanonicalStudyFoundationEvidence;
    basis: SourceOccurrenceAnchorBasis;
  };
  const ranked: Ranked[] = [];

  for (const field of fields) {
    for (const evidence of evidenceCandidates(field, true)) {
      const hasWordSpan =
        evidence.wordStartIndex != null && evidence.wordEndIndex != null;
      ranked.push({
        evidence,
        basis: hasWordSpan ? "verified_word_span" : "verified_page_quote",
      });
    }
  }
  ranked.sort((a, b) => {
    const page = a.evidence.page - b.evidence.page;
    if (page !== 0) {
      return page;
    }
    const aStart = a.evidence.wordStartIndex ?? 999999;
    const bStart = b.evidence.wordStartIndex ?? 999999;
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    return (a.evidence.wordEndIndex ?? 999999) - (b.evidence.wordEndIndex ?? 999999);
  });
  if (ranked[0]) {
    return ranked[0];
  }

  for (const field of fields) {
    for (const evidence of evidenceCandidates(field, false)) {
      return { evidence, basis: "proposed_page_quote" };
    }
  }
  return null;
}

function packAnchorMaterial(
  slice: RecordFieldSlice,
  pack: ProposalDomainPack,
): string | null {
  const recordDef = pack.recordTypes.find((record) => record.id === slice.recordTypeId);
  const anchorFieldIds = recordDef?.identity?.occurrenceAnchorFieldIds ?? [];
  if (anchorFieldIds.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const fieldId of anchorFieldIds) {
    const field = slice.fields.find((item) => item.fieldId === fieldId);
    if (!field || field.disposition !== "verified") {
      return null;
    }
    const verified = field as CanonicalStudyFoundationVerifiedField;
    parts.push(`${fieldId}=${JSON.stringify(verified.normalized.normalizedValue ?? null)}`);
  }
  return parts.join("|");
}

function anchorKeyForRecord(
  slice: RecordFieldSlice,
  pack: ProposalDomainPack,
): {
  anchorKey: string;
  basis: SourceOccurrenceAnchorBasis;
} {
  const packAnchor = packAnchorMaterial(slice, pack);
  if (packAnchor) {
    return {
      anchorKey: `pk|${stableId16(packAnchor)}`,
      basis: "pack_anchor_fields",
    };
  }

  const primary = pickPrimaryEvidence(slice.fields);
  if (primary) {
    const { evidence, basis } = primary;
    const wordPart =
      evidence.wordStartIndex != null && evidence.wordEndIndex != null
        ? `|w${evidence.wordStartIndex}-${evidence.wordEndIndex}`
        : "";
    return {
      anchorKey: `p${evidence.page}${wordPart}|q${quoteDigest(evidence.quote)}`,
      basis,
    };
  }

  const fingerprintMaterial = slice.fields
    .slice()
    .sort((a, b) => a.fieldKey.localeCompare(b.fieldKey))
    .map((field) => `${field.fieldId}=${JSON.stringify(field.displayValue ?? null)}`)
    .join("|");
  return {
    anchorKey: `fp|${stableId16(fingerprintMaterial)}`,
    basis: "field_fingerprint_fallback",
  };
}

function tieBreakMaterial(slice: RecordFieldSlice): string {
  return slice.fields
    .slice()
    .sort((a, b) => a.fieldId.localeCompare(b.fieldId))
    .map((field) => `${field.fieldId}:${JSON.stringify(field.displayValue ?? null)}`)
    .join(";");
}

function sliceFieldsByRecord(
  groupedRecords: readonly CanonicalStudyFoundationGroupedRecord[],
  fieldOutcomes: readonly CanonicalStudyFoundationFieldOutcome[],
): RecordFieldSlice[] {
  const fieldsByGroup = new Map<string, CanonicalStudyFoundationFieldOutcome[]>();
  for (const field of fieldOutcomes) {
    const recordGroupId = buildRecordGroupId({
      sourceDocumentId: field.sourceDocumentId,
      recordTypeId: field.recordTypeId,
      instanceIndex: field.instanceIndex,
    });
    const list = fieldsByGroup.get(recordGroupId) ?? [];
    list.push(field);
    fieldsByGroup.set(recordGroupId, list);
  }

  return groupedRecords.map((group) => ({
    recordGroupId: group.recordGroupId,
    sourceDocumentId: group.sourceDocumentId,
    recordTypeId: group.recordTypeId,
    instanceIndex: group.instanceIndex,
    fields: fieldsByGroup.get(group.recordGroupId) ?? [],
  }));
}

/** Stage 1 — source-local occurrence ids (entity identity is resolved later). */
export function assignSourceOccurrenceIds(input: {
  pack: ProposalDomainPack;
  groupedRecords: readonly CanonicalStudyFoundationGroupedRecord[];
  fieldOutcomes: readonly CanonicalStudyFoundationFieldOutcome[];
}): AssignSourceOccurrenceIdsResult {
  const slices = sliceFieldsByRecord(input.groupedRecords, input.fieldOutcomes);
  const assignments = new Map<string, SourceOccurrenceAssignment>();
  const unstableOccurrenceItems: CanonicalStudyFoundationUnresolvedItem[] = [];

  const byCollisionBucket = new Map<string, RecordFieldSlice[]>();
  for (const slice of slices) {
    const { anchorKey } = anchorKeyForRecord(slice, input.pack);
    const bucket = `${slice.sourceDocumentId}|${slice.recordTypeId}|${anchorKey}`;
    const list = byCollisionBucket.get(bucket) ?? [];
    list.push(slice);
    byCollisionBucket.set(bucket, list);
  }

  for (const [, colliding] of byCollisionBucket) {
    colliding.sort((a, b) => {
      const tie = tieBreakMaterial(a).localeCompare(tieBreakMaterial(b));
      if (tie !== 0) {
        return tie;
      }
      return a.recordGroupId.localeCompare(b.recordGroupId);
    });

    if (colliding.length > 1) {
      for (const slice of colliding) {
        unstableOccurrenceItems.push({
          id: `unstable-occurrence:${slice.recordGroupId}`,
          kind: "unstable_occurrence_identity",
          message:
            "Indistinguishable source occurrences share all available anchors; cross-rerun occurrence correspondence is not guaranteed.",
          sourceDocumentId: slice.sourceDocumentId,
          recordGroupId: slice.recordGroupId,
        });
      }
    }

    for (let collisionIndex = 0; collisionIndex < colliding.length; collisionIndex++) {
      const slice = colliding[collisionIndex]!;
      const { anchorKey, basis } = anchorKeyForRecord(slice, input.pack);
      const bucket = `${slice.sourceDocumentId}|${slice.recordTypeId}|${anchorKey}`;
      const material = `${bucket}|c${collisionIndex}|${tieBreakMaterial(slice)}|${slice.recordGroupId}`;
      assignments.set(slice.recordGroupId, {
        sourceOccurrenceId: stableId16(material),
        anchorBasis: basis,
      });
    }
  }

  const groupedRecords = input.groupedRecords.map((group) => {
    const assignment = assignments.get(group.recordGroupId);
    if (!assignment) {
      throw new Error(`SOURCE_OCCURRENCE_ASSIGNMENT_MISSING:${group.recordGroupId}`);
    }
    return {
      ...group,
      sourceOccurrenceId: assignment.sourceOccurrenceId,
      sourceOccurrenceAnchorBasis: assignment.anchorBasis,
    };
  });

  unstableOccurrenceItems.sort((a, b) => a.id.localeCompare(b.id));
  return { groupedRecords, unstableOccurrenceItems };
}

export function resolveSourceOccurrenceIdForRecord(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  sourceOccurrenceId?: string | null;
}): string {
  if (input.sourceOccurrenceId) {
    return input.sourceOccurrenceId;
  }
  return buildRecordGroupId({
    sourceDocumentId: input.sourceDocumentId,
    recordTypeId: input.recordTypeId,
    instanceIndex: input.instanceIndex,
  });
}
