import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { DocumentPages } from "../../document/page-model.js";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import {
  CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION,
  type CanonicalStudyFoundationArtifact,
  type CanonicalStudyFoundationArtifactBody,
  type CanonicalStudyFoundationCounts,
  type CanonicalStudyFoundationRejectedField,
  type CanonicalStudyFoundationUnresolvedField,
  type CanonicalStudyFoundationUnresolvedItem,
  type CanonicalStudyFoundationVerifiedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import { flattenProposedFields } from "./flatten-proposed-fields.js";
import { groupRecordsWithinDocuments } from "./group-records.js";
import { hashCanonicalStudyFoundationBody } from "./hash-body.js";
import { normalizeVerifiedField } from "./normalize-verified-field.js";
import { orderDocumentsAndRecords } from "./order-documents-and-records.js";
import { buildFieldKey } from "./field-key.js";
import { tryDerivedPrimitive } from "./primitives.js";
import { verifyProposedField } from "./verify-proposed-field.js";

export type CanonicalStudyFoundationDocumentInput = {
  sourceDocumentId: string;
  envelope: ReaderDocumentExtractionEnvelope;
  documentPages: DocumentPages | null;
};

export type BuildCanonicalStudyFoundationInput = {
  pack: ProposalDomainPack;
  packContentSha256: string;
  caseId: string;
  documents: CanonicalStudyFoundationDocumentInput[];
  createdAt?: string;
};

function buildCounts(
  verified: number,
  rejected: number,
  unresolved: number,
): CanonicalStudyFoundationCounts {
  return {
    proposed: verified + rejected + unresolved,
    verified,
    rejected,
    unresolved,
  };
}

function documentTypeBySource(input: {
  proposedFields: { sourceDocumentId: string; documentTypeId: string | null }[];
  envelopes: ReaderDocumentExtractionEnvelope[];
}): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const envelope of input.envelopes) {
    if (!map.has(envelope.sourceDocumentId)) {
      const docType = envelope.parsedModelJson?.documentTypeId;
      map.set(
        envelope.sourceDocumentId,
        typeof docType === "string" ? docType : null,
      );
    }
  }
  for (const field of input.proposedFields) {
    if (field.documentTypeId) {
      map.set(field.sourceDocumentId, field.documentTypeId);
    }
  }
  return map;
}

function computeDerivedFields(input: {
  pack: ProposalDomainPack;
  groupedRecords: ReturnType<typeof groupRecordsWithinDocuments>;
  verifiedByKey: Map<string, CanonicalStudyFoundationVerifiedField>;
  envelopeBySource: Map<string, ReaderDocumentExtractionEnvelope>;
}): {
  derivedVerified: CanonicalStudyFoundationVerifiedField[];
  derivedUnresolved: CanonicalStudyFoundationUnresolvedField[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
} {
  const derivedVerified: CanonicalStudyFoundationVerifiedField[] = [];
  const derivedUnresolved: CanonicalStudyFoundationUnresolvedField[] = [];
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [];

  for (const group of input.groupedRecords) {
    const recordDef = input.pack.recordTypes.find((r) => r.id === group.recordTypeId);
    if (!recordDef) {
      continue;
    }
    for (const fieldDef of recordDef.fields) {
      if (!fieldDef.source.includes("derived") || !fieldDef.derivation) {
        continue;
      }
      const fieldKey = buildFieldKey({
        sourceDocumentId: group.sourceDocumentId,
        recordTypeId: group.recordTypeId,
        instanceIndex: group.instanceIndex,
        fieldId: fieldDef.id,
      });
      if (input.verifiedByKey.has(fieldKey)) {
        continue;
      }

      const operandValues: Record<string, unknown> = {};
      let operandsReady = true;
      for (const operandId of fieldDef.derivation.operands) {
        const operandKey = buildFieldKey({
          sourceDocumentId: group.sourceDocumentId,
          recordTypeId: group.recordTypeId,
          instanceIndex: group.instanceIndex,
          fieldId: operandId,
        });
        const verifiedOperand = input.verifiedByKey.get(operandKey);
        if (!verifiedOperand) {
          operandsReady = false;
          break;
        }
        operandValues[operandId] = verifiedOperand.normalized.normalizedValue;
        if (operandId === "frequency_text" && typeof verifiedOperand.displayValue === "string") {
          operandValues.frequency_text = verifiedOperand.displayValue;
        }
      }

      const envelope = input.envelopeBySource.get(group.sourceDocumentId);
      const base = {
        fieldKey,
        sourceDocumentId: group.sourceDocumentId,
        recordTypeId: group.recordTypeId,
        instanceIndex: group.instanceIndex,
        fieldId: fieldDef.id,
        documentTypeId: null as string | null,
        valueKind: fieldDef.valueKind,
        provenance: "derived",
        modality: fieldDef.modality?.[0] ?? "planned",
        missingState: null,
        displayValue: null,
        evidence: null,
        envelopeRef: {
          studyRunId: envelope?.studyRunId ?? "",
          attemptId: envelope?.attemptId ?? "",
          sourceDocumentId: group.sourceDocumentId,
          envelopeStatus: envelope?.status ?? "UNKNOWN",
        },
        parseErrors: [],
      };

      if (!operandsReady) {
        derivedUnresolved.push({
          ...base,
          disposition: "unresolved",
          reasons: ["Derived field operands are not all verified."],
        });
        unresolvedItems.push({
          id: `derived-operand:${fieldKey}`,
          kind: "derived_operand_unverified",
          message: `Derived field ${fieldKey} missing verified operands.`,
          sourceDocumentId: group.sourceDocumentId,
          fieldKey,
          recordGroupId: group.recordGroupId,
        });
        continue;
      }

      const result = tryDerivedPrimitive(fieldDef.derivation.primitive, operandValues);
      if (!result.ok) {
        derivedUnresolved.push({
          ...base,
          disposition: "unresolved",
          reasons: [result.reason],
        });
        unresolvedItems.push({
          id: `derived-unsupported:${fieldKey}`,
          kind: "unsupported_derivation",
          message: result.reason,
          sourceDocumentId: group.sourceDocumentId,
          fieldKey,
          recordGroupId: group.recordGroupId,
        });
        continue;
      }

      const proposedLike = {
        ...base,
        displayValue: result.value,
      };
      derivedVerified.push({
        ...proposedLike,
        disposition: "verified",
        verifiedEvidence: [],
        normalized: {
          valueKind: fieldDef.valueKind,
          displayValue: result.value,
          normalizedValue: result.value,
          unit: result.unit ?? fieldDef.unit ?? null,
        },
        reasons: [],
      });
    }
  }

  derivedVerified.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  derivedUnresolved.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  return { derivedVerified, derivedUnresolved, unresolvedItems };
}

export function buildCanonicalStudyFoundation(
  input: BuildCanonicalStudyFoundationInput,
): CanonicalStudyFoundationArtifact {
  const envelopes = input.documents.map((doc) => doc.envelope);
  const pagesBySource = new Map(
    input.documents.map((doc) => [doc.sourceDocumentId, doc.documentPages] as const),
  );
  const envelopeBySource = new Map(
    input.documents.map((doc) => [doc.sourceDocumentId, doc.envelope] as const),
  );

  const studyRunId = envelopes[0]?.studyRunId ?? "";
  const attemptId = envelopes[0]?.attemptId ?? "";

  const flattened = flattenProposedFields({ pack: input.pack, envelopes });
  const groupedRecords = groupRecordsWithinDocuments(flattened.proposedFields);

  const verifiedFields: CanonicalStudyFoundationVerifiedField[] = [];
  const rejectedFields: CanonicalStudyFoundationRejectedField[] = [];
  const unresolvedFields: CanonicalStudyFoundationUnresolvedField[] = [];
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [...flattened.unresolvedItems];

  for (const field of flattened.proposedFields) {
    const verifyResult = verifyProposedField({
      field,
      pack: input.pack,
      documentPages: pagesBySource.get(field.sourceDocumentId) ?? null,
    });

    if (verifyResult.status === "verified") {
      const normalized = normalizeVerifiedField({ field, pack: input.pack });
      verifiedFields.push({
        ...field,
        disposition: "verified",
        verifiedEvidence: verifyResult.verifiedEvidence,
        normalized,
        reasons: [],
      });
    } else if (verifyResult.status === "rejected") {
      rejectedFields.push({
        ...field,
        disposition: "rejected",
        reasons: verifyResult.reasons,
      });
    } else {
      unresolvedFields.push({
        ...field,
        disposition: "unresolved",
        reasons: verifyResult.reasons,
      });
    }
  }

  verifiedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  rejectedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  unresolvedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  const verifiedByKey = new Map(verifiedFields.map((field) => [field.fieldKey, field] as const));
  const derived = computeDerivedFields({
    pack: input.pack,
    groupedRecords,
    verifiedByKey,
    envelopeBySource,
  });
  verifiedFields.push(...derived.derivedVerified);
  unresolvedFields.push(...derived.derivedUnresolved);
  unresolvedItems.push(...derived.unresolvedItems);

  verifiedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  unresolvedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));

  const docTypeMap = documentTypeBySource({
    proposedFields: flattened.proposedFields,
    envelopes,
  });
  const ordered = orderDocumentsAndRecords({
    pack: input.pack,
    verifiedFields,
    groupedRecords,
    documentTypeBySourceId: docTypeMap,
    allSourceDocumentIds: input.documents.map((doc) => doc.sourceDocumentId),
  });
  unresolvedItems.push(...ordered.unresolvedItems);
  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  const proposedCount = flattened.proposedFields.length;
  const verifiedProposed = verifiedFields.filter((field) => field.provenance !== "derived").length;
  const rejectedCount = rejectedFields.length;
  const unresolvedProposed =
    unresolvedFields.filter((field) => field.provenance !== "derived").length;

  if (verifiedProposed + rejectedCount + unresolvedProposed !== proposedCount) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_FIELD_ACCOUNTING_MISMATCH");
  }

  const counts = buildCounts(verifiedProposed, rejectedCount, unresolvedProposed);

  const body: CanonicalStudyFoundationArtifactBody = {
    schemaVersion: CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION,
    packId: input.pack.manifest.id,
    packVersion: input.pack.manifest.version,
    packContentSha256: input.packContentSha256,
    studyRunId,
    attemptId,
    caseId: input.caseId,
    counts,
    documents: ordered.documents,
    groupedRecords: ordered.groupedRecords,
    verifiedFields,
    rejectedFields,
    unresolvedFields,
    unresolvedItems,
  };

  const contentSha256 = hashCanonicalStudyFoundationBody(body);

  return {
    ...body,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    contentSha256,
  };
}
