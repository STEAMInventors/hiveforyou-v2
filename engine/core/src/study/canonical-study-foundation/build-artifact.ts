import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { DocumentPages } from "../../document/page-model.js";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import type { CanonicalStudyDocumentExtractionStatus } from "@hiveforyou/shared/canonical-study-foundation";
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

import { findConsecutiveWordQuote } from "../../document/find-consecutive-word-quote.js";
import {
  resolveClassificationStatus,
} from "../canonical-study/evaluate-source-coverage.js";
import { flattenProposedFields } from "./flatten-proposed-fields.js";
import { groupRecordsWithinDocuments } from "./group-records.js";
import { hashCanonicalStudyFoundationBody } from "./hash-body.js";
import { normalizeVerifiedField } from "./normalize-verified-field.js";
import { orderDocumentsAndRecords } from "./order-documents-and-records.js";
import { buildFieldKey } from "./field-key.js";
import { tryDerivedPrimitive, unitsEquivalent } from "./primitives.js";
import { verifyProposedField } from "./verify-proposed-field.js";

export type CanonicalStudyFoundationDocumentInput = {
  sourceDocumentId: string;
  envelope: ReaderDocumentExtractionEnvelope;
  documentPages: DocumentPages | null;
  extractionStatusOverride?: CanonicalStudyDocumentExtractionStatus;
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

  const workingVerifiedByKey = new Map(input.verifiedByKey);

  for (const group of input.groupedRecords) {
    const recordDef = input.pack.recordTypes.find((r) => r.id === group.recordTypeId);
    if (!recordDef) {
      continue;
    }
    const derivedFieldDefs = recordDef.fields.filter(
      (fieldDef) => fieldDef.source.includes("derived") && fieldDef.derivation,
    );
    let progressed = true;
    let passes = 0;
    while (progressed && passes < derivedFieldDefs.length + 1) {
      progressed = false;
      passes += 1;
      for (const fieldDef of derivedFieldDefs) {
      const derivation = fieldDef.derivation;
      if (!derivation) {
        continue;
      }
      const fieldKey = buildFieldKey({
        sourceDocumentId: group.sourceDocumentId,
        recordTypeId: group.recordTypeId,
        instanceIndex: group.instanceIndex,
        fieldId: fieldDef.id,
      });
      if (workingVerifiedByKey.has(fieldKey)) {
        continue;
      }

      const attempts = [
        { primitive: derivation.primitive, operands: derivation.operands },
        ...(derivation.alternates ?? []),
      ];
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

      let result: ReturnType<typeof tryDerivedPrimitive> | null = null;
      let lastReason = "Derived field operands are not all verified.";
      let attempted = false;
      for (const attempt of attempts) {
        const operandValues: Record<string, unknown> = {};
        let operandsReady = true;
        for (const operandId of attempt.operands) {
          const operandKey = buildFieldKey({
            sourceDocumentId: group.sourceDocumentId,
            recordTypeId: group.recordTypeId,
            instanceIndex: group.instanceIndex,
            fieldId: operandId,
          });
          const verifiedOperand = workingVerifiedByKey.get(operandKey);
          if (!verifiedOperand) {
            operandsReady = false;
            break;
          }
          operandValues[operandId] = verifiedOperand.normalized.normalizedValue;
          if (operandId === "frequency_text" && typeof verifiedOperand.displayValue === "string") {
            operandValues.frequency_text = verifiedOperand.displayValue;
          }
        }
        if (!operandsReady) {
          continue;
        }
        attempted = true;
        const attemptResult = tryDerivedPrimitive(attempt.primitive, operandValues);
        if (attemptResult.ok) {
          result = attemptResult;
          break;
        }
        lastReason = attemptResult.reason;
      }

      // Explicit weekly total ("150 minutes weekly") may fill ONLY a field declared in min/week.
      if (!result?.ok && unitsEquivalent(fieldDef.unit, "min/week")) {
        const frequencyKey = buildFieldKey({
          sourceDocumentId: group.sourceDocumentId,
          recordTypeId: group.recordTypeId,
          instanceIndex: group.instanceIndex,
          fieldId: "frequency_text",
        });
        const frequencyOperand = workingVerifiedByKey.get(frequencyKey);
        if (frequencyOperand && typeof frequencyOperand.displayValue === "string") {
          const fallback = tryDerivedPrimitive("explicitTotalPerWeek", {
            frequency_text: frequencyOperand.displayValue,
          });
          if (fallback.ok) {
            result = fallback;
          }
        }
      }

      // A derived value may never land in a field whose declared unit differs.
      if (result?.ok && result.unit != null && fieldDef.unit != null && !unitsEquivalent(result.unit, fieldDef.unit)) {
        result = null;
      }

      if (!result?.ok) {
        continue;
      }

      const proposedLike = {
        ...base,
        displayValue: result.value,
      };
      const verifiedDerived = {
        ...proposedLike,
        disposition: "verified" as const,
        verifiedEvidence: [],
        normalized: {
          valueKind: fieldDef.valueKind,
          displayValue: result.value,
          normalizedValue: result.value,
          unit: result.unit ?? fieldDef.unit ?? null,
        },
        reasons: [] as [],
      };
      derivedVerified.push(verifiedDerived);
      workingVerifiedByKey.set(fieldKey, verifiedDerived);
      progressed = true;
      }
    }

    for (const fieldDef of derivedFieldDefs) {
      const fieldKey = buildFieldKey({
        sourceDocumentId: group.sourceDocumentId,
        recordTypeId: group.recordTypeId,
        instanceIndex: group.instanceIndex,
        fieldId: fieldDef.id,
      });
      if (workingVerifiedByKey.has(fieldKey)) {
        continue;
      }
      derivedUnresolved.push({
        fieldKey,
        sourceDocumentId: group.sourceDocumentId,
        recordTypeId: group.recordTypeId,
        instanceIndex: group.instanceIndex,
        fieldId: fieldDef.id,
        documentTypeId: null,
        valueKind: fieldDef.valueKind,
        provenance: "derived",
        modality: fieldDef.modality?.[0] ?? "planned",
        missingState: null,
        displayValue: null,
        evidence: null,
        envelopeRef: {
          studyRunId: input.envelopeBySource.get(group.sourceDocumentId)?.studyRunId ?? "",
          attemptId: input.envelopeBySource.get(group.sourceDocumentId)?.attemptId ?? "",
          sourceDocumentId: group.sourceDocumentId,
          envelopeStatus: input.envelopeBySource.get(group.sourceDocumentId)?.status ?? "UNKNOWN",
        },
        parseErrors: [],
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
  const extractionStatusBySource = new Map(
    input.documents.map(
      (doc) =>
        [
          doc.sourceDocumentId,
          doc.extractionStatusOverride ?? doc.envelope.status,
        ] as const,
    ),
  );
  const classificationStatusBySource = new Map(
    input.documents.map((doc) => {
      const rawType = doc.envelope.parsedModelJson?.documentTypeId;
      const classificationInput =
        typeof rawType === "string"
          ? rawType
          : docTypeMap.get(doc.sourceDocumentId) ?? null;
      return [doc.sourceDocumentId, resolveClassificationStatus(classificationInput)] as const;
    }),
  );

  const ordered = orderDocumentsAndRecords({
    pack: input.pack,
    verifiedFields,
    groupedRecords,
    documentTypeBySourceId: docTypeMap,
    allSourceDocumentIds: input.documents.map((doc) => doc.sourceDocumentId),
    trustedPagesSuppliedBySource: new Map(
      input.documents.map((doc) => [doc.sourceDocumentId, doc.documentPages != null] as const),
    ),
    matchedPageTermsBySource: matchedPageTermsBySource(input.pack, input.documents),
    extractionStatusBySource,
    classificationStatusBySource,
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

function packPageTerms(pack: ProposalDomainPack): string[] {
  const terms = new Set<string>();
  for (const rule of pack.requirements?.rules ?? []) {
    for (const check of rule.checks ?? []) {
      for (const term of check.pageTerms ?? []) {
        const trimmed = term.trim();
        if (trimmed) {
          terms.add(trimmed);
        }
      }
    }
  }
  return [...terms].sort((a, b) => a.localeCompare(b));
}

function matchedPageTermsBySource(
  pack: ProposalDomainPack,
  documents: readonly CanonicalStudyFoundationDocumentInput[],
): Map<string, string[]> {
  const terms = packPageTerms(pack);
  const matches = new Map<string, string[]>();
  for (const document of documents) {
    if (!document.documentPages || terms.length === 0) {
      matches.set(document.sourceDocumentId, []);
      continue;
    }
    const hits: string[] = [];
    for (const term of terms) {
      const found = document.documentPages.pages.some((page) => findConsecutiveWordQuote(page.words, term) != null);
      if (found) {
        hits.push(term);
      }
    }
    matches.set(document.sourceDocumentId, hits);
  }
  return matches;
}
