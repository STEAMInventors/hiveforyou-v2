# Path B: Deterministic Canonical Study — Source Code

Full implementation for extraction JSON to foundation to canonical study JSON.

Snapshot of repository TypeScript (implementation only, no tests). Architecture: `path-b-canonical-study-architecture.md`.

---

## `engine/core/src/study/canonical-study-foundation/build-artifact.ts`

```typescript
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
import { tryDerivedPrimitive } from "./primitives.js";
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
        { primitive: fieldDef.derivation.primitive, operands: fieldDef.derivation.operands },
        ...(fieldDef.derivation.alternates ?? []),
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

      if (!result?.ok) {
        const usesFrequencyText =
          fieldDef.derivation?.operands.includes("frequency_text") ||
          fieldDef.derivation?.alternates?.some((alternate) =>
            alternate.operands.includes("frequency_text"),
          );
        if (usesFrequencyText) {
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
        reasons: [],
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
```

## `engine/core/src/study/canonical-study-foundation/field-key.ts`

```typescript
import { createHash } from "node:crypto";

export function buildFieldKey(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
}): string {
  return `${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}|${input.fieldId}`;
}

export function buildRecordGroupId(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
}): string {
  const material = `${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function parsePackFieldPath(path: string): { recordTypeId: string; fieldId: string } | null {
  const trimmed = path.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return null;
  }
  return {
    recordTypeId: trimmed.slice(0, dot),
    fieldId: trimmed.slice(dot + 1),
  };
}
```

## `engine/core/src/study/canonical-study-foundation/flatten-proposed-fields.ts`

```typescript
import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { parseAndValidatePackDrivenExtraction } from "@hiveforyou/domain-pack/pack-driven-reader";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import type {
  CanonicalStudyFoundationEnvelopeRef,
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationProposedField,
  CanonicalStudyFoundationUnresolvedItem,
} from "@hiveforyou/shared/canonical-study-foundation";

import { buildFieldKey } from "./field-key.js";

export type FlattenProposedFieldsResult = {
  proposedFields: CanonicalStudyFoundationProposedField[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

function envelopeRef(envelope: ReaderDocumentExtractionEnvelope): CanonicalStudyFoundationEnvelopeRef {
  return {
    studyRunId: envelope.studyRunId,
    attemptId: envelope.attemptId,
    sourceDocumentId: envelope.sourceDocumentId,
    envelopeStatus: envelope.status,
  };
}

function toEvidence(
  raw: { sourceDocumentId: string; page: number; quote: string } | null,
): CanonicalStudyFoundationEvidence | null {
  if (!raw) {
    return null;
  }
  return {
    sourceDocumentId: raw.sourceDocumentId,
    page: raw.page,
    quote: raw.quote,
  };
}

export function flattenProposedFields(input: {
  pack: ProposalDomainPack;
  envelopes: ReaderDocumentExtractionEnvelope[];
}): FlattenProposedFieldsResult {
  const proposedFields: CanonicalStudyFoundationProposedField[] = [];
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [];

  for (const envelope of input.envelopes) {
    const ref = envelopeRef(envelope);

    if (envelope.status !== "SUCCEEDED") {
      unresolvedItems.push({
        id: `extraction-unavailable:${envelope.sourceDocumentId}`,
        kind: "extraction_unavailable",
        message: `Raw extraction envelope status ${envelope.status} for document ${envelope.sourceDocumentId}.`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    if (!envelope.parsedModelJson) {
      unresolvedItems.push({
        id: `parse-failure:${envelope.sourceDocumentId}`,
        kind: "parse_failure",
        message: `Succeeded envelope missing parsedModelJson for document ${envelope.sourceDocumentId}.`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    const parsed = parseAndValidatePackDrivenExtraction({
      pack: input.pack,
      raw: envelope.parsedModelJson,
      expectedSourceDocumentId: envelope.sourceDocumentId,
    });

    if (parsed.errors.length > 0 && parsed.recordInstances.length === 0) {
      unresolvedItems.push({
        id: `parse-failure:${envelope.sourceDocumentId}`,
        kind: "parse_failure",
        message: `Structural parse failed for document ${envelope.sourceDocumentId}: ${parsed.errors.join("; ")}`,
        sourceDocumentId: envelope.sourceDocumentId,
      });
      continue;
    }

    for (const record of parsed.recordInstances) {
      for (const field of record.fields) {
        proposedFields.push({
          fieldKey: buildFieldKey({
            sourceDocumentId: envelope.sourceDocumentId,
            recordTypeId: record.recordTypeId,
            instanceIndex: record.instanceIndex,
            fieldId: field.fieldId,
          }),
          sourceDocumentId: envelope.sourceDocumentId,
          recordTypeId: record.recordTypeId,
          instanceIndex: record.instanceIndex,
          fieldId: field.fieldId,
          documentTypeId: parsed.documentTypeId,
          valueKind: field.valueKind,
          provenance: field.provenance,
          modality: field.modality,
          missingState: field.missingState,
          displayValue: field.value,
          evidence: toEvidence(field.evidence),
          envelopeRef: ref,
          parseErrors: parsed.errors,
        });
      }
    }
  }

  proposedFields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  return { proposedFields, unresolvedItems };
}
```

## `engine/core/src/study/canonical-study-foundation/group-records.ts`

```typescript
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
```

## `engine/core/src/study/canonical-study-foundation/hash-body.ts`

```typescript
﻿import { hashCanonicalJson } from "../fingerprint.js";
import type { CanonicalStudyFoundationArtifactBody } from "@hiveforyou/shared/canonical-study-foundation";

/** Hash deterministic artifact body — excludes createdAt and contentSha256. */
export function hashCanonicalStudyFoundationBody(
  body: CanonicalStudyFoundationArtifactBody,
): string {
  return hashCanonicalJson(body);
}
```

## `engine/core/src/study/canonical-study-foundation/index.ts`

```typescript
export {
  buildCanonicalStudyFoundation,
  type BuildCanonicalStudyFoundationInput,
  type CanonicalStudyFoundationDocumentInput,
} from "./build-artifact.js";
export { flattenProposedFields } from "./flatten-proposed-fields.js";
export { groupRecordsWithinDocuments } from "./group-records.js";
export { hashCanonicalStudyFoundationBody } from "./hash-body.js";
export { normalizeVerifiedField } from "./normalize-verified-field.js";
export { orderDocumentsAndRecords } from "./order-documents-and-records.js";
export { verifyProposedField } from "./verify-proposed-field.js";
export { tryDerivedPrimitive, parseFrequency, ratePerWeek, explicitTotalPerWeek } from "./primitives.js";
```

## `engine/core/src/study/canonical-study-foundation/normalize-verified-field.ts`

```typescript
import {
  applyComparableNormalizeSteps,
  DEFAULT_COMPARABLE_NORMALIZE_STEPS,
  type ProposalDomainPack,
  type ProposalRecordField,
} from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFoundationNormalizedValue,
  CanonicalStudyFoundationProposedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import {
  normalizeAttributeRaw,
  normalizeMoney,
  normalizePartialDate,
} from "../../atoms/normalize.js";

function resolveFieldDef(
  pack: ProposalDomainPack,
  recordTypeId: string,
  fieldId: string,
): ProposalRecordField | null {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  return record?.fields.find((f) => f.id === fieldId) ?? null;
}

function resolveUnitAlias(pack: ProposalDomainPack, unit: string | null | undefined): string | null {
  if (!unit) {
    return null;
  }
  const vocabulary = pack.vocabulary?.unitAliases;
  if (!vocabulary) {
    return unit;
  }
  const lower = unit.trim().toLowerCase();
  if (Array.isArray(vocabulary)) {
    for (const entry of vocabulary) {
      if (entry.canonical.toLowerCase() === lower) {
        return entry.canonical;
      }
      if (entry.aliases.some((alias) => alias.toLowerCase() === lower)) {
        return entry.canonical;
      }
    }
    return unit;
  }
  for (const [canonical, aliases] of Object.entries(vocabulary)) {
    if (canonical.toLowerCase() === lower) {
      return canonical;
    }
    if (aliases.some((alias) => alias.toLowerCase() === lower)) {
      return canonical;
    }
  }
  return unit;
}

function applyLegacyCodeValue(input: {
  pack: ProposalDomainPack;
  recordTypeId: string;
  fieldId: string;
  code: string;
}): string {
  const legacyMap = input.pack.vocabulary?.readerLegacyContextMap;
  if (!legacyMap) {
    return input.code;
  }
  const fieldPath = `${input.recordTypeId}.${input.fieldId}`;
  const scoped = legacyMap[fieldPath] as Record<string, string> | undefined;
  const global = legacyMap[input.fieldId] as Record<string, string> | undefined;
  return scoped?.[input.code] ?? global?.[input.code] ?? input.code;
}

function comparableStepsForRecord(
  pack: ProposalDomainPack,
  recordTypeId: string,
): readonly ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[] {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  const merged = new Set<string>();
  for (const constructId of record?.usesConstructs ?? []) {
    for (const step of pack.constructs?.[constructId]?.normalize ?? []) {
      merged.add(step);
    }
  }
  if (merged.size === 0) {
    return DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  return [...merged] as ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[];
}

function applyComparableNormalizeForField(input: {
  pack: ProposalDomainPack;
  recordTypeId: string;
  fieldId: string;
  text: string;
}): string {
  const fieldPath = `${input.recordTypeId}.${input.fieldId}`;
  const raw = normalizeAttributeRaw(input.text);
  return applyComparableNormalizeSteps(
    raw,
    comparableStepsForRecord(input.pack, input.recordTypeId),
    input.pack,
    fieldPath,
  );
}

export function normalizeVerifiedField(input: {
  field: CanonicalStudyFoundationProposedField;
  pack: ProposalDomainPack;
  documentYearHint?: number | null;
  documentMonthHint?: number | null;
}): CanonicalStudyFoundationNormalizedValue {
  const def = resolveFieldDef(input.pack, input.field.recordTypeId, input.field.fieldId);
  const displayValue = input.field.displayValue;
  const valueKind = input.field.valueKind;

  switch (valueKind) {
    case "date": {
      const raw = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
      const iso =
        /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? raw
          : normalizePartialDate(raw, input.documentYearHint ?? null, input.documentMonthHint ?? null);
      return {
        valueKind,
        displayValue,
        normalizedValue: iso,
      };
    }
    case "quantity": {
      let amount: number | null = null;
      if (typeof displayValue === "number" && Number.isFinite(displayValue)) {
        amount = displayValue;
      } else if (typeof displayValue === "string") {
        amount = normalizeMoney(displayValue) ?? Number.parseFloat(displayValue);
      }
      const unit = resolveUnitAlias(input.pack, def?.unit ?? null);
      return {
        valueKind,
        displayValue,
        normalizedValue: amount,
        unit,
      };
    }
    case "code":
    case "classification": {
      const rawCode =
        typeof displayValue === "string" ? displayValue.trim().toLowerCase() : displayValue;
      const code =
        typeof rawCode === "string"
          ? applyLegacyCodeValue({
              pack: input.pack,
              recordTypeId: input.field.recordTypeId,
              fieldId: input.field.fieldId,
              code: rawCode,
            })
          : rawCode;
      return {
        valueKind,
        displayValue,
        normalizedValue: code,
      };
    }
    case "text": {
      const raw = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
      const normalized = applyComparableNormalizeForField({
        pack: input.pack,
        recordTypeId: input.field.recordTypeId,
        fieldId: input.field.fieldId,
        text: raw,
      });
      return {
        valueKind,
        displayValue,
        normalizedValue: normalized,
      };
    }
    case "boolean": {
      return {
        valueKind,
        displayValue,
        normalizedValue: displayValue,
      };
    }
    default:
      return {
        valueKind,
        displayValue,
        normalizedValue: displayValue,
        unit: def?.unit ?? null,
      };
  }
}
```

## `engine/core/src/study/canonical-study-foundation/order-documents-and-records.ts`

```typescript
import type { ProposalCompositionRule, ProposalDomainPack } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyDocumentClassificationStatus,
  CanonicalStudyDocumentExtractionStatus,
  CanonicalStudyFoundationDocumentOrder,
  CanonicalStudyFoundationGroupedRecord,
  CanonicalStudyFoundationUnresolvedItem,
  CanonicalStudyFoundationVerifiedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import { parsePackFieldPath } from "./field-key.js";

function resolveAmendmentCompositionRule(
  pack: ProposalDomainPack,
  amendmentDocumentTypeId: string,
): Pick<ProposalCompositionRule, "changeRecordTypeId" | "amendmentTargetDateFieldId" | "baseDocumentTypeId"> | null {
  for (const rule of pack.compositionRules ?? []) {
    if (rule.amendmentDocumentTypeId === amendmentDocumentTypeId) {
      return rule;
    }
  }
  for (const recordType of pack.recordTypes) {
    if (recordType.composition?.role !== "amendment_change") {
      continue;
    }
    for (const docType of pack.documentTypes) {
      if (
        docType.id === amendmentDocumentTypeId &&
        docType.amends &&
        docType.checklist.includes(recordType.id)
      ) {
        return {
          baseDocumentTypeId: docType.amends,
          changeRecordTypeId: recordType.id,
          amendmentTargetDateFieldId: recordType.composition.amendmentTargetDateFieldId,
        };
      }
    }
  }
  return null;
}

export type OrderDocumentsInput = {
  pack: ProposalDomainPack;
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  documentTypeBySourceId: Map<string, string | null>;
  allSourceDocumentIds: string[];
  trustedPagesSuppliedBySource?: ReadonlyMap<string, boolean>;
  matchedPageTermsBySource?: ReadonlyMap<string, readonly string[]>;
  extractionStatusBySource?: ReadonlyMap<string, CanonicalStudyDocumentExtractionStatus>;
  classificationStatusBySource?: ReadonlyMap<string, CanonicalStudyDocumentClassificationStatus>;
};

export type OrderDocumentsResult = {
  documents: CanonicalStudyFoundationDocumentOrder[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

function resolveParty(
  pack: ProposalDomainPack,
  authorRoleId: string | null,
): string | null {
  if (!authorRoleId) {
    return null;
  }
  const role = pack.authorRoles?.find((r) => r.id === authorRoleId);
  return role?.party ?? null;
}

function findVerifiedOrderingDate(
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[],
  sourceDocumentId: string,
  orderingDatePath: string,
): { iso: string | null; fieldPath: string | null } {
  const parsed = parsePackFieldPath(orderingDatePath);
  if (!parsed) {
    return { iso: null, fieldPath: null };
  }
  const match = verifiedFields.find(
    (field) =>
      field.sourceDocumentId === sourceDocumentId &&
      field.recordTypeId === parsed.recordTypeId &&
      field.fieldId === parsed.fieldId &&
      field.normalized.normalizedValue != null,
  );
  if (!match) {
    return { iso: null, fieldPath: orderingDatePath };
  }
  const normalized = match.normalized.normalizedValue;
  const iso = typeof normalized === "string" ? normalized : null;
  return { iso, fieldPath: orderingDatePath };
}

function resolveVerifiedOrderingDate(input: {
  pack: ProposalDomainPack;
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[];
  sourceDocumentId: string;
  typeSpec: ProposalDomainPack["documentTypes"][number] | null | undefined;
}): { iso: string | null; fieldPath: string | null; primaryPath: string | null } {
  const paths = [
    input.typeSpec?.orderingDate,
    ...(input.typeSpec?.orderingDatePaths ?? []),
  ].filter((path): path is string => typeof path === "string" && path.length > 0);

  for (const path of paths) {
    const ordering = findVerifiedOrderingDate(input.verifiedFields, input.sourceDocumentId, path);
    if (ordering.iso) {
      return { ...ordering, primaryPath: paths[0] ?? path };
    }
  }

  const primaryPath = paths[0] ?? null;
  if (primaryPath) {
    const fallback = findVerifiedOrderingDate(
      input.verifiedFields,
      input.sourceDocumentId,
      primaryPath,
    );
    return { ...fallback, primaryPath };
  }
  return { iso: null, fieldPath: null, primaryPath: null };
}

function resolveAmendmentLink(input: {
  pack: ProposalDomainPack;
  sourceDocumentId: string;
  documentTypeId: string | null;
  verifiedFields: readonly CanonicalStudyFoundationVerifiedField[];
  allSourceDocumentIds: string[];
  documentTypeBySourceId: Map<string, string | null>;
}): Pick<
  CanonicalStudyFoundationDocumentOrder,
  "amendsDocumentTypeId" | "amendmentLinkStatus" | "amendmentTargetSourceDocumentId"
> {
  if (!input.documentTypeId) {
    return {
      amendsDocumentTypeId: null,
      amendmentLinkStatus: "not_applicable",
      amendmentTargetSourceDocumentId: null,
    };
  }
  const typeSpec = input.pack.documentTypes.find((d) => d.id === input.documentTypeId);
  if (!typeSpec?.amends) {
    return {
      amendsDocumentTypeId: null,
      amendmentLinkStatus: "not_applicable",
      amendmentTargetSourceDocumentId: null,
    };
  }

  const compositionRule = resolveAmendmentCompositionRule(input.pack, input.documentTypeId);
  const targetDateFieldId = compositionRule?.amendmentTargetDateFieldId?.trim();
  const changeRecordTypeId = compositionRule?.changeRecordTypeId;
  const targetDateField =
    targetDateFieldId && changeRecordTypeId
      ? input.verifiedFields.find(
          (field) =>
            field.sourceDocumentId === input.sourceDocumentId &&
            field.recordTypeId === changeRecordTypeId &&
            field.fieldId === targetDateFieldId &&
            typeof field.normalized.normalizedValue === "string",
        )
      : undefined;
  const targetDate = targetDateField?.normalized.normalizedValue as string | undefined;

  if (!targetDateFieldId || !changeRecordTypeId || !targetDate) {
    return {
      amendsDocumentTypeId: typeSpec.amends,
      amendmentLinkStatus: "unresolved",
      amendmentTargetSourceDocumentId: null,
    };
  }

  const candidateTargets = input.allSourceDocumentIds.filter((id) => {
    if (id === input.sourceDocumentId) {
      return false;
    }
    const otherType = input.documentTypeBySourceId.get(id);
    return otherType === typeSpec.amends;
  });

  for (const candidateId of candidateTargets) {
    const otherType = input.pack.documentTypes.find(
      (d) => d.id === input.documentTypeBySourceId.get(candidateId),
    );
    if (!otherType?.orderingDate) {
      continue;
    }
    const otherDate = findVerifiedOrderingDate(
      input.verifiedFields,
      candidateId,
      otherType.orderingDate,
    );
    if (otherDate.iso === targetDate) {
      return {
        amendsDocumentTypeId: typeSpec.amends,
        amendmentLinkStatus: "linked",
        amendmentTargetSourceDocumentId: candidateId,
      };
    }
  }

  return {
    amendsDocumentTypeId: typeSpec.amends,
    amendmentLinkStatus: "unresolved",
    amendmentTargetSourceDocumentId: null,
  };
}

export function orderDocumentsAndRecords(input: OrderDocumentsInput): OrderDocumentsResult {
  const unresolvedItems: CanonicalStudyFoundationUnresolvedItem[] = [];
  const sourceDocumentIds = [...new Set(input.allSourceDocumentIds)].sort((a, b) =>
    a.localeCompare(b),
  );

  const documents: CanonicalStudyFoundationDocumentOrder[] = sourceDocumentIds.map(
    (sourceDocumentId) => {
      const documentTypeId = input.documentTypeBySourceId.get(sourceDocumentId) ?? null;
      const typeSpec = documentTypeId
        ? input.pack.documentTypes.find((d) => d.id === documentTypeId)
        : null;
      const ordering = resolveVerifiedOrderingDate({
        pack: input.pack,
        verifiedFields: input.verifiedFields,
        sourceDocumentId,
        typeSpec,
      });

      if (ordering.primaryPath && !ordering.iso) {
        unresolvedItems.push({
          id: `missing-ordering-date:${sourceDocumentId}`,
          kind: "missing_ordering_date",
          message: `Verified ordering date missing for document ${sourceDocumentId} at ${ordering.primaryPath}.`,
          sourceDocumentId,
        });
      }

      const amendment = resolveAmendmentLink({
        pack: input.pack,
        sourceDocumentId,
        documentTypeId,
        verifiedFields: input.verifiedFields,
        allSourceDocumentIds: sourceDocumentIds,
        documentTypeBySourceId: input.documentTypeBySourceId,
      });

      if (amendment.amendmentLinkStatus === "unresolved") {
        unresolvedItems.push({
          id: `amendment-link:${sourceDocumentId}`,
          kind: "amendment_link_unresolved",
          message: `Amendment link unresolved for document ${sourceDocumentId}.`,
          sourceDocumentId,
        });
      }

      return {
        sourceDocumentId,
        documentTypeId,
        authorRoleId: typeSpec?.authorRole ?? null,
        party: resolveParty(input.pack, typeSpec?.authorRole ?? null),
        verifiedOrderingDate: ordering.iso,
        orderingDateFieldPath: ordering.fieldPath,
        sortRank: 0,
        extractionStatus: input.extractionStatusBySource?.get(sourceDocumentId) ?? "MISSING_ENVELOPE",
        classificationStatus:
          input.classificationStatusBySource?.get(sourceDocumentId) ?? "unclassified",
        trustedPagesSupplied: input.trustedPagesSuppliedBySource?.get(sourceDocumentId) ?? false,
        matchedPageTerms: [...(input.matchedPageTermsBySource?.get(sourceDocumentId) ?? [])].sort((a, b) =>
          a.localeCompare(b),
        ),
        ...amendment,
      };
    },
  );

  documents.sort((a, b) => {
    if (a.verifiedOrderingDate && b.verifiedOrderingDate) {
      const dateCmp = a.verifiedOrderingDate.localeCompare(b.verifiedOrderingDate);
      if (dateCmp !== 0) {
        return dateCmp;
      }
    } else if (a.verifiedOrderingDate) {
      return -1;
    } else if (b.verifiedOrderingDate) {
      return 1;
    }
    return a.sourceDocumentId.localeCompare(b.sourceDocumentId);
  });

  documents.forEach((doc, index) => {
    doc.sortRank = index;
  });

  const groupedRecords = [...input.groupedRecords].sort((a, b) => {
    const docA = documents.find((d) => d.sourceDocumentId === a.sourceDocumentId);
    const docB = documents.find((d) => d.sourceDocumentId === b.sourceDocumentId);
    const rankA = docA?.sortRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = docB?.sortRank ?? Number.MAX_SAFE_INTEGER;
    return (
      rankA - rankB ||
      a.recordTypeId.localeCompare(b.recordTypeId) ||
      a.instanceIndex - b.instanceIndex
    );
  });

  unresolvedItems.sort((a, b) => a.id.localeCompare(b.id));

  return { documents, groupedRecords, unresolvedItems };
}
```

## `engine/core/src/study/canonical-study-foundation/primitives.ts`

```typescript
export type DerivedPrimitiveResult =
  | { ok: true; value: unknown; unit?: string | null }
  | { ok: false; reason: string };

const FREQUENCY_PATTERN =
  /(\d+)\s*(?:times?|x)\s*(?:per|\/)\s*(day|week|month|year|grading[_ ]period)/i;
const MINUTES_PER_SESSION_PATTERN = /(\d+(?:\.\d+)?)\s*minutes?/i;

export function parseFrequency(frequencyText: string): DerivedPrimitiveResult {
  const trimmed = frequencyText.trim();
  if (!trimmed) {
    return { ok: false, reason: "frequency_text is empty" };
  }
  const match = FREQUENCY_PATTERN.exec(trimmed);
  if (!match) {
    return { ok: false, reason: "frequency_text does not match parseFrequency pattern" };
  }
  const sessions = Number.parseInt(match[1]!, 10);
  const period = match[2]!.toLowerCase().replace(/\s+/g, "_");
  if (!Number.isFinite(sessions) || sessions <= 0) {
    return { ok: false, reason: "frequency_text sessions count invalid" };
  }
  return {
    ok: true,
    value: sessions,
    unit: null,
  };
}

const PERIOD_TO_WEEKS: Record<string, number> = {
  day: 1 / 7,
  week: 1,
  month: 52 / 12,
  year: 52,
  grading_period: 9,
};

export function ratePerWeek(input: {
  minutesPerSession: number;
  sessionsPerPeriod: number;
  period: string;
}): DerivedPrimitiveResult {
  const periodKey = input.period.trim().toLowerCase().replace(/\s+/g, "_");
  const weeksFactor = PERIOD_TO_WEEKS[periodKey];
  if (weeksFactor == null) {
    return { ok: false, reason: `period ${input.period} is not convertible to week` };
  }
  if (!Number.isFinite(input.minutesPerSession) || input.minutesPerSession <= 0) {
    return { ok: false, reason: "minutes_per_session invalid" };
  }
  if (!Number.isFinite(input.sessionsPerPeriod) || input.sessionsPerPeriod <= 0) {
    return { ok: false, reason: "sessions_per_period invalid" };
  }
  const minutesPerWeek = input.minutesPerSession * input.sessionsPerPeriod * weeksFactor;
  return {
    ok: true,
    value: Math.round(minutesPerWeek * 100) / 100,
    unit: "min/week",
  };
}

const EXPLICIT_WEEKLY_TOTAL =
  /^(\d+(?:\.\d+)?)\s+minutes?\s+(?:weekly|per\s+week|\/\s*week)$/i;
const EXPLICIT_WEEKLY_TOTAL_SHORT =
  /^(\d+(?:\.\d+)?)\s+min(?:ute)?s?\s*(?:\/\s*)?week(?:ly)?$/i;

/** Explicit total such as "150 minutes weekly" — not a session-times-frequency rate. */
export function explicitTotalPerWeek(expression: string): DerivedPrimitiveResult {
  const trimmed = expression.trim();
  const match = EXPLICIT_WEEKLY_TOTAL.exec(trimmed) ?? EXPLICIT_WEEKLY_TOTAL_SHORT.exec(trimmed);
  if (!match) {
    return { ok: false, reason: "expression is not an explicit total duration per week" };
  }
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: "explicit total duration is not a positive number" };
  }
  return { ok: true, value, unit: "minutes_per_week" };
}

export function tryDerivedPrimitive(
  primitive: string,
  operands: Record<string, unknown>,
): DerivedPrimitiveResult {
  switch (primitive) {
    case "parseFrequency": {
      const text = operands.frequency_text;
      if (typeof text !== "string") {
        return { ok: false, reason: "parseFrequency operand frequency_text missing" };
      }
      return parseFrequency(text);
    }
    case "ratePerWeek": {
      const minutes = operands.minutes_per_session;
      const sessions = operands.sessions_per_period;
      const period = operands.period;
      if (typeof minutes !== "number" || typeof sessions !== "number" || typeof period !== "string") {
        return { ok: false, reason: "ratePerWeek operands missing or invalid" };
      }
      return ratePerWeek({
        minutesPerSession: minutes,
        sessionsPerPeriod: sessions,
        period,
      });
    }
    case "explicitTotalPerWeek": {
      const text = operands.frequency_text ?? operands.expression;
      if (typeof text !== "string") {
        return { ok: false, reason: "explicitTotalPerWeek operand frequency_text missing" };
      }
      return explicitTotalPerWeek(text);
    }
    default:
      return { ok: false, reason: `unsupported derivation primitive: ${primitive}` };
  }
}

export function extractMinutesFromFrequencyText(text: string): number | null {
  const match = MINUTES_PER_SESSION_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1]!);
  return Number.isFinite(value) ? value : null;
}
```

## `engine/core/src/study/canonical-study-foundation/verify-proposed-field.ts`

```typescript
﻿import type { ProposalDomainPack, ProposalRecordField } from "@hiveforyou/domain-pack";
import { findConsecutiveWordQuote } from "../../document/find-consecutive-word-quote.js";
import type { DocumentPages, PageWord } from "../../document/page-model.js";
import {
  normalizeAttributeRaw,
  normalizeMoney,
  normalizePartialDate,
} from "../../atoms/normalize.js";
import { normalizeQuoteForMatch } from "../../document/normalize-quote-text.js";
import type {
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationProposedField,
} from "@hiveforyou/shared/canonical-study-foundation";

export type VerifyFieldResult =
  | { status: "verified"; verifiedEvidence: CanonicalStudyFoundationEvidence[]; reasons: [] }
  | { status: "rejected"; reasons: string[] }
  | { status: "unresolved"; reasons: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveFieldDef(
  pack: ProposalDomainPack,
  recordTypeId: string,
  fieldId: string,
): ProposalRecordField | null {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  return record?.fields.find((f) => f.id === fieldId) ?? null;
}

function orderedWords(words: readonly PageWord[]): PageWord[] {
  return [...words].sort((a, b) => a.seq - b.seq);
}

function verifyQuoteOnPage(
  documentPages: DocumentPages,
  ev: CanonicalStudyFoundationEvidence,
): CanonicalStudyFoundationEvidence | { reason: string } {
  if (documentPages.documentId !== ev.sourceDocumentId) {
    return { reason: `Document identity mismatch for ${ev.sourceDocumentId}.` };
  }
  const page = documentPages.pages.find((p) => p.pageNumber === ev.page);
  if (!page) {
    return { reason: `Page ${ev.page} is out of bounds for document ${ev.sourceDocumentId}.` };
  }
  const quote = ev.quote.trim();
  if (!quote) {
    return { reason: "Evidence quote is empty." };
  }
  const match = findConsecutiveWordQuote(page.words, quote);
  if (!match) {
    return {
      reason: `Quote does not match page ${ev.page} word sequence for ${ev.sourceDocumentId}.`,
    };
  }
  const sorted = orderedWords(page.words);
  const startWord = sorted[match.wordStartIndex]!;
  const endWord = sorted[match.wordEndIndex]!;
  return {
    sourceDocumentId: ev.sourceDocumentId,
    page: ev.page,
    quote,
    spanStart: startWord.seq,
    spanEnd: endWord.seq,
    wordStartIndex: match.wordStartIndex,
    wordEndIndex: match.wordEndIndex,
  };
}

function quoteContainsNormalizedDate(quote: string, isoDate: string): boolean {
  const normalizedQuote = normalizeQuoteForMatch(quote);
  if (normalizedQuote.includes(isoDate)) {
    return true;
  }
  const parts = isoDate.split("-");
  const year = parts[0]!;
  const month = Number.parseInt(parts[1]!, 10);
  const day = Number.parseInt(parts[2]!, 10);
  const mdyVariants = [
    `${month}/${day}/${year}`,
    `${month}/${day}/${year.slice(-2)}`,
    `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
  ];
  return mdyVariants.some((variant) => normalizedQuote.includes(variant));
}

function quoteContainsNumber(quote: string, value: number): boolean {
  const normalizedQuote = normalizeQuoteForMatch(quote);
  const asInt = String(Math.trunc(value));
  const asFixed = value % 1 === 0 ? asInt : String(value);
  if (normalizedQuote.includes(asFixed)) {
    return true;
  }
  const money = normalizeMoney(normalizedQuote);
  return money != null && Math.abs(money - value) < 0.01;
}

function verifyValueRepresentation(
  field: CanonicalStudyFoundationProposedField,
  def: ProposalRecordField | null,
  quote: string,
): string | null {
  const value = field.displayValue;
  if (value == null) {
    return null;
  }

  switch (field.valueKind) {
    case "date": {
      const raw = typeof value === "string" ? value : String(value);
      const iso =
        ISO_DATE.test(raw) ? raw : normalizePartialDate(raw, null, null);
      if (!iso) {
        return "date value is not parseable";
      }
      if (!quoteContainsNormalizedDate(quote, iso)) {
        return "date value does not match evidence quote representation";
      }
      return null;
    }
    case "quantity": {
      let numeric: number | null = null;
      if (typeof value === "number" && Number.isFinite(value)) {
        numeric = value;
      } else if (typeof value === "string") {
        numeric = normalizeMoney(value) ?? Number.parseFloat(value);
      }
      if (numeric == null || !Number.isFinite(numeric)) {
        return "quantity value is not numeric";
      }
      if (!quoteContainsNumber(quote, numeric)) {
        return "quantity value does not match evidence quote representation";
      }
      return null;
    }
    case "code":
    case "text": {
      if (typeof value !== "string") {
        return null;
      }
      if (field.provenance === "quoted") {
        const normalizedValue = normalizeAttributeRaw(value);
        const normalizedQuote = normalizeAttributeRaw(quote);
        if (!normalizedQuote.includes(normalizedValue)) {
          return "quoted text value does not appear in evidence quote";
        }
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return "boolean value invalid";
      }
      return null;
    }
    default:
      return null;
  }
}

function verifyEnum(
  field: CanonicalStudyFoundationProposedField,
  def: ProposalRecordField | null,
): string | null {
  if (field.provenance !== "classified" || !def?.enum?.length) {
    return null;
  }
  if (def.valueKind === "classification") {
    const lower = def.enum.map((v) => v.toLowerCase());
    if (!["yes", "no", "unclear"].every((state) => lower.includes(state))) {
      return "classification field enum invalid in pack";
    }
  }
  const code =
    typeof field.displayValue === "string"
      ? field.displayValue
      : field.displayValue == null
        ? null
        : String(field.displayValue);
  if (!code) {
    return "classified value missing";
  }
  if (!def.enum.includes(code)) {
    return `classified value ${code} not in pack enum`;
  }
  return null;
}

export function verifyProposedField(input: {
  field: CanonicalStudyFoundationProposedField;
  pack: ProposalDomainPack;
  documentPages: DocumentPages | null;
}): VerifyFieldResult {
  const { field } = input;

  if (field.missingState) {
    return {
      status: "unresolved",
      reasons: [`Field marked missingState=${field.missingState}.`],
    };
  }

  const def = resolveFieldDef(input.pack, field.recordTypeId, field.fieldId);
  if (
    def?.source.includes("derived") &&
    !def.source.some((s: string) => s === "quoted" || s === "classified")
  ) {
    return {
      status: "unresolved",
      reasons: ["Derived-only field must be computed by engine, not emitted as proposed."],
    };
  }

  if ((field.provenance === "quoted" || field.provenance === "classified") && !field.evidence) {
    return { status: "rejected", reasons: [`Evidence required for provenance ${field.provenance}.`] };
  }

  const enumIssue = verifyEnum(field, def);
  if (enumIssue) {
    return { status: "rejected", reasons: [enumIssue] };
  }

  if (!field.evidence) {
    return { status: "unresolved", reasons: ["Field has no evidence and is not a missing-state row."] };
  }

  if (!input.documentPages) {
    return { status: "rejected", reasons: [`Trusted document pages unavailable for ${field.sourceDocumentId}.`] };
  }

  const quoteResult = verifyQuoteOnPage(input.documentPages, field.evidence);
  if ("reason" in quoteResult) {
    return { status: "rejected", reasons: [quoteResult.reason] };
  }

  const valueIssue = verifyValueRepresentation(field, def, field.evidence.quote);
  if (valueIssue) {
    return { status: "rejected", reasons: [valueIssue] };
  }

  return { status: "verified", verifiedEvidence: [quoteResult], reasons: [] };
}
```

## `engine/core/src/study/canonical-study/build-series.ts`

```typescript
import type {
  CanonicalStudyEntity,
  CanonicalStudyProvenanceChip,
  CanonicalStudySeries,
  CanonicalStudySeriesObservation,
} from "@hiveforyou/shared/canonical-study-artifact";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";

import { buildSeriesDimensionKey, valuesEquivalent } from "./construct-keys.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

const VALUE_ROLES = ["value", "baseline_value", "target_value"] as const;

export function buildSeries(input: {
  indexed: IndexedFoundation;
  entities: CanonicalStudyEntity[];
}): CanonicalStudySeries[] {
  const { indexed, entities } = input;
  const seriesByKey = new Map<string, CanonicalStudySeries>();

  for (const entity of entities) {
    if (entity.status === "identity_unresolved") {
      continue;
    }
    const recordDef = indexed.pack.recordTypes.find((record) => record.id === entity.recordTypeId);
    for (const constructId of recordDef?.usesConstructs ?? []) {
      for (const version of entity.recordVersions) {
        const indexedVersion = indexed.recordsByGroupId.get(version.recordGroupId);
        if (!indexedVersion) {
          continue;
        }
        appendObservation({
          entity,
          indexedVersion,
          constructId,
          indexed,
          seriesByKey,
        });
      }
    }
  }

  let series = [...seriesByKey.values()];
  series = consolidateEquivalentSeries(series, indexed.pack);
  for (const item of series) {
    item.sourceEntityIds = [...new Set(item.sourceEntityIds)].sort((a, b) => a.localeCompare(b));
    item.entityId = item.sourceEntityIds.length === 1 ? item.sourceEntityIds[0]! : stableId(item.sourceEntityIds.join(","));
    item.observations.sort((a, b) => {
      const dateCmp = (a.observedDate ?? "").localeCompare(b.observedDate ?? "");
      if (dateCmp !== 0) {
        return dateCmp;
      }
      const roleCmp = a.role.localeCompare(b.role);
      if (roleCmp !== 0) {
        return roleCmp;
      }
      return a.provenance.fieldKey.localeCompare(b.provenance.fieldKey);
    });
    item.observations.forEach((observation, index) => {
      observation.orderingRank = index;
    });
  }
  series.sort((a, b) => a.id.localeCompare(b.id));
  return series;
}

function observedDateForRecord(
  record: IndexedRecordVersion,
  pack: ProposalDomainPack,
): string | null {
  for (const fieldId of pack.seriesObservationDateFieldIds ?? []) {
    const chip = record.provenanceByFieldKey[fieldId];
    const value = chip?.normalized.normalizedValue;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return record.orderingDate;
}

function observationSignature(observation: CanonicalStudySeriesObservation): string {
  return `${observation.role}|${observation.observedDate ?? ""}|${JSON.stringify(observation.value.normalizedValue)}`;
}

function appendObservation(input: {
  entity: CanonicalStudyEntity;
  indexedVersion: IndexedRecordVersion;
  constructId: string;
  indexed: IndexedFoundation;
  seriesByKey: Map<string, CanonicalStudySeries>;
}): void {
  const dimensionKey = buildSeriesDimensionKey(input.indexedVersion, input.constructId, input.indexed.pack);
  if (!dimensionKey) {
    return;
  }

  for (const fieldId of VALUE_ROLES) {
    const chip = input.indexedVersion.provenanceByFieldKey[fieldId];
    if (!chip) {
      continue;
    }

    const observedDate = observedDateForRecord(input.indexedVersion, input.indexed.pack);
    const material = `${input.constructId}|${dimensionKey}`;
    const seriesId = stableId(material);
    let series = input.seriesByKey.get(seriesId);
    if (!series) {
      series = {
        id: seriesId,
        entityId: input.entity.id,
        sourceEntityIds: [],
        constructId: input.constructId,
        dimensionKey,
        observations: [],
        unresolvedReasons: [],
      };
      input.seriesByKey.set(seriesId, series);
    }
    if (!series.sourceEntityIds.includes(input.entity.id)) {
      series.sourceEntityIds.push(input.entity.id);
    }

    if (!observedDate) {
      if (!series.unresolvedReasons.includes("missing_observed_date")) {
        series.unresolvedReasons.push("missing_observed_date");
      }
      continue;
    }

    const candidate: CanonicalStudySeriesObservation = {
      orderingRank: series.observations.length,
      role: fieldId,
      observedDate,
      value: chip.normalized,
      provenance: chip,
      corroboratingProvenance: [],
    };
    const signature = observationSignature(candidate);
    const existing = series.observations.find((observation) => observationSignature(observation) === signature);
    if (existing) {
      if (!provenanceEquals(existing.provenance, chip) && !existing.corroboratingProvenance.some((item) => provenanceEquals(item, chip))) {
        existing.corroboratingProvenance.push(chip);
      }
      continue;
    }
    series.observations.push(candidate);
  }
}

function provenanceEquals(left: CanonicalStudyProvenanceChip, right: CanonicalStudyProvenanceChip): boolean {
  return left.fieldKey === right.fieldKey;
}

function dimensionPart(dimensionKey: string, fieldSuffix: string): string | null {
  const prefix = `${fieldSuffix}=`;
  const part = dimensionKey.split("|").find((item) => item.startsWith(prefix));
  return part ? part.slice(prefix.length) : null;
}

function seriesMergeKey(series: CanonicalStudySeries): string {
  const scoreType = dimensionPart(series.dimensionKey, "measure.score_type") ?? "";
  return `${series.constructId}|${scoreType}`;
}

function mergeSeriesObservations(
  target: CanonicalStudySeries,
  source: CanonicalStudySeries,
): void {
  for (const observation of source.observations) {
    const signature = observationSignature(observation);
    const existing = target.observations.find((item) => observationSignature(item) === signature);
    if (existing) {
      if (
        !provenanceEquals(existing.provenance, observation.provenance) &&
        !existing.corroboratingProvenance.some((item) => provenanceEquals(item, observation.provenance))
      ) {
        existing.corroboratingProvenance.push(observation.provenance);
      }
      for (const chip of observation.corroboratingProvenance) {
        if (
          !provenanceEquals(existing.provenance, chip) &&
          !existing.corroboratingProvenance.some((item) => provenanceEquals(item, chip))
        ) {
          existing.corroboratingProvenance.push(chip);
        }
      }
      continue;
    }
    target.observations.push({
      ...observation,
      corroboratingProvenance: observation.corroboratingProvenance.slice(),
    });
  }
  for (const reason of source.unresolvedReasons) {
    if (!target.unresolvedReasons.includes(reason)) {
      target.unresolvedReasons.push(reason);
    }
  }
  for (const entityId of source.sourceEntityIds) {
    if (!target.sourceEntityIds.includes(entityId)) {
      target.sourceEntityIds.push(entityId);
    }
  }
}

function consolidateEquivalentSeries(
  series: CanonicalStudySeries[],
  pack: ProposalDomainPack,
): CanonicalStudySeries[] {
  const groups = new Map<string, CanonicalStudySeries[]>();
  for (const item of series) {
    const key = seriesMergeKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const merged: CanonicalStudySeries[] = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey));
    const absorbed = new Set<string>();
    for (let i = 0; i < sorted.length; i += 1) {
      const left = sorted[i]!;
      if (absorbed.has(left.id)) {
        continue;
      }
      let canonical = left;
      for (let j = i + 1; j < sorted.length; j += 1) {
        const right = sorted[j]!;
        if (absorbed.has(right.id)) {
          continue;
        }
        const leftTask = dimensionPart(left.dimensionKey, "measure.task");
        const rightTask = dimensionPart(right.dimensionKey, "measure.task");
        const equivalent = valuesEquivalent(leftTask, rightTask, left.constructId, pack);
        if (equivalent === "different") {
          continue;
        }
        if (right.dimensionKey.localeCompare(canonical.dimensionKey) < 0) {
          mergeSeriesObservations(right, canonical);
          absorbed.add(canonical.id);
          canonical = right;
        } else {
          mergeSeriesObservations(canonical, right);
          absorbed.add(right.id);
        }
      }
      merged.push(canonical);
      absorbed.add(canonical.id);
    }
  }
  return merged;
}
```

## `engine/core/src/study/canonical-study/compose-operative-views.ts`

```typescript
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
      const distinctValues = new Set(
        versionsWithField.map((entry) => JSON.stringify(entry.chip!.normalized.normalizedValue)),
      );
      if (versionsWithField.length === 1 || distinctValues.size === 1) {
        return {
          fieldId,
          status: "operative" as const,
          provenance: versionsWithField[versionsWithField.length - 1]!.chip,
          competingProvenance: [],
        };
      }

      const latest = versionsWithField[versionsWithField.length - 1]!;
      return {
        fieldId,
        status: "conflicted" as const,
        provenance: latest.chip,
        competingProvenance: versionsWithField.map((entry) => entry.chip!),
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
```

## `engine/core/src/study/canonical-study/construct-keys.ts`

```typescript
import {
  applyComparableNormalizeSteps,
  DEFAULT_COMPARABLE_NORMALIZE_STEPS,
  parseFieldSynonyms,
  type ProposalConstruct,
  type ProposalDomainPack,
} from "@hiveforyou/domain-pack";

import type { IndexedRecordVersion } from "./indexed-foundation.js";

function normalizeStepsForField(
  pack: ProposalDomainPack,
  recordTypeId: string,
  constructId?: string,
): readonly ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[] {
  if (constructId) {
    return pack.constructs?.[constructId]?.normalize ?? DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  const merged = new Set<string>();
  for (const constructKey of record?.usesConstructs ?? []) {
    for (const step of pack.constructs?.[constructKey]?.normalize ?? []) {
      merged.add(step);
    }
  }
  if (merged.size === 0) {
    return DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  return [...merged] as ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[];
}

export function normalizedFieldValue(
  record: IndexedRecordVersion,
  fieldId: string,
  pack: ProposalDomainPack,
  constructId?: string,
): string | null {
  const chip = record.provenanceByFieldKey[fieldId];
  if (!chip) {
    return null;
  }
  const raw = chip.normalized.normalizedValue;
  if (raw == null || raw === "") {
    return null;
  }
  const fieldPath = `${record.recordTypeId}.${fieldId}`;
  const steps = normalizeStepsForField(pack, record.recordTypeId, constructId);
  return applyComparableNormalizeSteps(String(raw), steps, pack, fieldPath);
}

export type ContentKeyResult = {
  key: string | null;
  partial: boolean;
  parts: Record<string, string | null>;
  missingRequired: string[];
  conflictingOptional: string[];
};

export function buildContentKey(
  record: IndexedRecordVersion,
  pack: ProposalDomainPack,
): ContentKeyResult {
  const recordDef = pack.recordTypes.find((r) => r.id === record.recordTypeId);
  const identity = recordDef?.identity;
  const missingRequired: string[] = [];
  const conflictingOptional: string[] = [];
  const parts: Record<string, string | null> = {};

  if (!identity) {
    return { key: null, partial: true, parts, missingRequired: ["identity"], conflictingOptional };
  }

  for (const fieldId of identity.keyFields ?? []) {
    const value = normalizedFieldValue(record, fieldId, pack);
    parts[fieldId] = value;
    if (value == null) {
      missingRequired.push(fieldId);
    }
  }

  if (missingRequired.length > 0) {
    return { key: null, partial: true, parts, missingRequired, conflictingOptional };
  }

  const material = (identity.keyFields ?? [])
    .map((fieldId) => `${fieldId}=${parts[fieldId] ?? ""}`)
    .join("|");
  return { key: material, partial: false, parts, missingRequired, conflictingOptional };
}

export function buildConstructJoinKey(
  record: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): string | null {
  const construct = pack.constructs?.[constructId] as ProposalConstruct | undefined;
  if (!construct) {
    return null;
  }
  const parts: string[] = [];
  for (const fieldSuffix of construct.requiredFields ?? []) {
    const fieldId = `${constructId}.${fieldSuffix}`;
    const value = normalizedFieldValue(record, fieldId, pack, constructId);
    if (value == null) {
      return null;
    }
    parts.push(`${fieldId}=${value}`);
  }
  return parts.join("|");
}

export function valuesEquivalent(
  left: string | null,
  right: string | null,
  constructId: string | undefined,
  pack: ProposalDomainPack,
): "equal" | "different" | "possibly_same" {
  if (left == null || right == null) {
    return "different";
  }
  if (left === right) {
    return "equal";
  }
  const onPartial = constructId ? pack.constructs?.[constructId]?.onPartialMatch : undefined;
  if (onPartial === "possiblySame") {
    if (left.includes(right) || right.includes(left)) {
      return "possibly_same";
    }
  }
  return "different";
}

/** Required construct key plus contextual dimensions that are actually verified. */
export function buildSeriesDimensionKey(
  record: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): string | null {
  const base = buildConstructJoinKey(record, constructId, pack);
  if (!base) {
    return null;
  }
  const construct = pack.constructs?.[constructId] as ProposalConstruct | undefined;
  const context: string[] = [];
  for (const fieldSuffix of construct?.comparedIfBothPresent ?? []) {
    const fieldId = `${constructId}.${fieldSuffix}`;
    const value = normalizedFieldValue(record, fieldId, pack, constructId);
    if (value != null) {
      context.push(`${fieldId}=${value}`);
    }
  }
  return [base, ...context].join("|");
}
```

## `engine/core/src/study/canonical-study/evaluate-insight-checks.ts`

```typescript
import type { ProposalInsightCheck, ProposalInsightOperand } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFlag,
  CanonicalStudyOperativeView,
  CanonicalStudyProvenanceChip,
  CanonicalStudySeries,
  CanonicalStudySourceContext,
} from "@hiveforyou/shared/canonical-study-artifact";

import { buildConstructJoinKey, normalizedFieldValue } from "./construct-keys.js";
import {
  compareValuesPrimitive,
  elapsedSincePrimitive,
  evaluateExists,
} from "./evaluate-primitives.js";
import {
  evaluateInsightOperandSourceCoverage,
  evaluateScopeSourceCoverage,
  mergeSourceCoverageEvaluations,
} from "./evaluate-source-coverage.js";
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

const FULLY_SUPPORTED_PRIMITIVES = new Set([
  "exists",
  "compareValues",
  "elapsedSince",
  "series",
  "absenceOf",
]);

const PARTIAL_PRIMITIVES = new Set(["coChange", "periodCoverage", "ageOnDate"]);

function resolveSourceDocumentLabel(
  sourceContext: CanonicalStudySourceContext,
  sourceDocumentId: string,
): string {
  const match = sourceContext.logicalDocuments?.find(
    (doc) => doc.sourceDocumentId === sourceDocumentId,
  );
  if (match?.filename?.trim()) {
    return match.filename.replace(/\.[^.]+$/, "");
  }
  return sourceDocumentId;
}

function substituteQuestion(
  template: string,
  placeholders: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  if (/\{[a-zA-Z0-9_]+\}/.test(result)) {
    return result;
  }
  return result;
}

function resolveOperand(
  indexed: IndexedFoundation,
  operand: { record?: string; field?: string } | undefined,
): ReturnType<typeof evaluateExists>["chips"][0] | null {
  if (!operand?.record || !operand.field) {
    return null;
  }
  const result = evaluateExists(indexed, operand.record, operand.field);
  return result.chips[0] ?? null;
}

export function evaluateInsightChecks(input: {
  indexed: IndexedFoundation;
  operativeViews: CanonicalStudyOperativeView[];
  series: CanonicalStudySeries[];
}): CanonicalStudyFlag[] {
  const checks = input.indexed.pack.insightChecks?.checks ?? [];
  const declared = new Set(input.indexed.pack.insightChecks?.enginePrimitivesRequired ?? []);
  const flags: CanonicalStudyFlag[] = [];

  for (const check of checks) {
    const primitive = check.primitive;
    if (primitive === "coChange" || primitive === "periodCoverage" || primitive === "ageOnDate") {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: unsupportedInsightMessage(primitive),
      });
      continue;
    }

    if (PARTIAL_PRIMITIVES.has(primitive)) {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: `Primitive ${primitive} is not fully implemented; no positive finding emitted.`,
      });
      continue;
    }

    if (!FULLY_SUPPORTED_PRIMITIVES.has(primitive) || !declared.has(primitive)) {
      flags.push({
        id: stableId(`flag:${check.id}:unsupported`),
        checkId: check.id,
        status: "unsupported",
        question: check.question ?? "",
        operands: [],
        message: `Primitive ${primitive} is unsupported or undeclared.`,
      });
      continue;
    }

    if (primitive === "exists") {
      const operand = resolveOperand(input.indexed, check.left ?? check.present);
      if (!operand) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [],
          message: "missing_verified_operand",
        });
        continue;
      }
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: substituteQuestion(check.question ?? "", { value: String(operand.normalized.displayValue ?? "") }),
        operands: [operand],
        message: "exists_verified",
      });
      continue;
    }

    if (primitive === "compareValues") {
      const left = resolveOperand(input.indexed, check.left);
      const right = resolveOperand(input.indexed, check.right);
      const cmp = compareValuesPrimitive(left, right);
      if (!cmp.ok) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [left, right].filter(Boolean) as NonNullable<typeof left>[],
          message: cmp.reason,
        });
        continue;
      }
      const equal = (cmp.value as { equal: boolean }).equal;
      if (check.fires === "values_differ_with_compatible_units" && equal) {
        continue;
      }
      if (!left || !right) {
        continue;
      }
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: substituteQuestion(check.question ?? "", {
          left: String(left.normalized.displayValue ?? ""),
          right: String(right.normalized.displayValue ?? ""),
        }),
        operands: [left, right],
        message: "compareValues_verified",
      });
      continue;
    }

    if (primitive === "absenceOf") {
      const flag = evaluateAbsenceOf(input.indexed, input.operativeViews, check);
      if (flag) {
        flags.push(flag);
      }
      continue;
    }

    if (primitive === "elapsedSince") {
      const fromOperand = operandField(check, "from");
      const toOperand = check.right ?? operandField(check, "to");
      if (fromOperand && !check.left && !toOperand) {
        const fromChip = resolveFilteredOperand(input.indexed, input.operativeViews, fromOperand, null);
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: fromChip ? [fromChip] : [],
          message: "missing_operand:comparison_end",
        });
        continue;
      }
      const left = resolveOperand(input.indexed, check.left);
      const right = resolveOperand(input.indexed, toOperand);
      const elapsed = elapsedSincePrimitive(left, right);
      if (!elapsed.ok || !left || !right) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [left, right].filter(Boolean) as NonNullable<typeof left>[],
          message: elapsed.ok ? "missing_operand" : elapsed.reason,
        });
        continue;
      }
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: check.question ?? "",
        operands: [left, right],
        message: "elapsedSince_verified",
      });
      continue;
    }

    if (primitive === "series") {
      const matching = input.series.filter((item) => item.observations.length >= 2);
      if (matching.length === 0) {
        flags.push({
          id: stableId(`flag:${check.id}:unresolved`),
          checkId: check.id,
          status: "unresolved",
          question: check.question ?? "",
          operands: [],
          message: "no_verified_series_with_two_observations",
        });
        continue;
      }
      const operands = matching[0]!.observations.map((observation) => observation.provenance);
      flags.push({
        id: stableId(`flag:${check.id}:fired`),
        checkId: check.id,
        status: "fired",
        question: check.question ?? "",
        operands,
        message: "series_verified",
      });
    }
  }

  flags.sort((a, b) => a.id.localeCompare(b.id));
  return flags;
}

function unsupportedInsightMessage(primitive: string): string {
  if (primitive === "coChange") {
    return "coChange_semantics_incomplete:window,direction_comparator";
  }
  if (primitive === "periodCoverage") {
    return "periodCoverage_semantics_incomplete:operative_plan_period,frequency_expansion";
  }
  return `Primitive ${primitive} is not fully implemented; no positive finding emitted.`;
}

function operandField(check: ProposalInsightCheck, key: string): ProposalInsightOperand | undefined {
  const value = check[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as ProposalInsightOperand;
}

function evaluateAbsenceOf(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  check: ProposalInsightCheck,
): CanonicalStudyFlag | null {
  const present = check.present;
  const absent = check.absent;
  const unresolved = (message: string, operands: CanonicalStudyProvenanceChip[] = []): CanonicalStudyFlag => ({
    id: stableId(`flag:${check.id}:unresolved`),
    checkId: check.id,
    status: "unresolved",
    question: check.question ?? "",
    operands,
    message,
  });

  const presentField = present?.field;
  const absentField = absent?.field;
  const joinOn = check.joinOn;
  if (!present?.record || !presentField || !absent?.record || !absentField || !joinOn) {
    return unresolved("absenceOf_operands_incomplete");
  }

  const presentRecords = recordsInInsightScope(indexed, operativeViews, present, null).filter((record) =>
    recordMatchesWhere(record, present.where),
  );
  const presentChips = presentRecords
    .map((record) => record.provenanceByFieldKey[presentField])
    .filter((chip): chip is CanonicalStudyProvenanceChip => {
      if (!chip) {
        return false;
      }
      const value = chip.normalized.normalizedValue;
      return value != null && value !== "";
    });
  if (presentChips.length === 0) {
    const operandCoverage = mergeSourceCoverageEvaluations([
      evaluateInsightOperandSourceCoverage({
        indexed,
        operand: present,
        anchorSourceDocumentId: null,
        mode: "absence",
      }),
      evaluateInsightOperandSourceCoverage({
        indexed,
        operand: absent,
        anchorSourceDocumentId: null,
        mode: "absence",
      }),
    ]);
    if (!operandCoverage.complete) {
      return unresolved(operandCoverage.message);
    }
    return unresolved("missing_present_operand");
  }

  const unmatched: CanonicalStudyProvenanceChip[] = [];
  for (const record of presentRecords) {
    const chip = record.provenanceByFieldKey[presentField];
    const value = chip?.normalized.normalizedValue;
    if (!chip || value == null || value === "") {
      continue;
    }
    const presentKey = insightJoinKey(indexed, record, presentField, joinOn);
    if (!presentKey) {
      return unresolved("join_key_unavailable", [chip]);
    }
    const absentRecords = recordsInInsightScope(indexed, operativeViews, absent, record.sourceDocumentId).filter(
      (candidate) => recordMatchesWhere(candidate, absent.where),
    );
    let matched = false;
    let blockingUnresolved = false;
    for (const candidate of absentRecords) {
      const joinState = joinFieldState(indexed, candidate, absentField);
      if (joinState === "verified") {
        const absentChip = candidate.provenanceByFieldKey[absentField]!;
        const absentKey = insightJoinKey(indexed, candidate, absentField, joinOn);
        if (!absentKey) {
          return unresolved("join_key_unavailable", [chip, absentChip]);
        }
        if (absentKey === presentKey) {
          matched = true;
          break;
        }
        continue;
      }
      if (joinState === "missing" || joinState === "rejected") {
        blockingUnresolved = true;
      }
    }
    if (blockingUnresolved && !matched) {
      return unresolved("absence_match_unresolved", [chip]);
    }
    if (!matched) {
      unmatched.push(chip);
    }
  }

  if (unmatched.length === 0) {
    return null;
  }

  const coverage = mergeSourceCoverageEvaluations([
    evaluateScopeSourceCoverage({
      indexed,
      scopeDocumentIds: new Set(
        presentRecords.map((record) => record.sourceDocumentId).concat(
          absent?.scope === "same_document"
            ? presentRecords.map((record) => record.sourceDocumentId)
            : [],
        ),
      ),
      appliesTo:
        present?.scope?.startsWith("operative:") || present?.scope?.startsWith("each:")
          ? present.scope
          : absent?.scope?.startsWith("operative:") || absent?.scope?.startsWith("each:")
            ? absent.scope
            : undefined,
      mode: "absence",
    }),
    evaluateInsightOperandSourceCoverage({
      indexed,
      operand: present,
      anchorSourceDocumentId: unmatched[0]?.sourceDocumentId ?? null,
      mode: "absence",
    }),
    evaluateInsightOperandSourceCoverage({
      indexed,
      operand: absent,
      anchorSourceDocumentId: unmatched[0]?.sourceDocumentId ?? null,
      mode: "absence",
    }),
  ]);
  if (!coverage.complete) {
    return unresolved(coverage.message, unmatched);
  }

  const area = unmatched[0] ? String(unmatched[0].normalized.displayValue ?? "") : "";
  const presentDocument = unmatched[0]
    ? resolveSourceDocumentLabel(indexed.sourceContext, unmatched[0].sourceDocumentId)
    : "";
  return {
    id: stableId(`flag:${check.id}:fired`),
    checkId: check.id,
    status: "fired",
    question: substituteQuestion(check.question ?? "", {
      area,
      presentDocument,
      accommodation: area,
    }),
    operands: unmatched.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey)),
    message: "absenceOf_verified",
  };
}

function recordsInInsightScope(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  operand: ProposalInsightOperand,
  anchorSourceDocumentId: string | null,
): IndexedRecordVersion[] {
  return indexed.records.filter((record) => {
    if (operand.record && record.recordTypeId !== operand.record) {
      return false;
    }
    const scope = operand.scope;
    if (!scope) {
      return true;
    }
    if (scope === "same_document") {
      return anchorSourceDocumentId == null || record.sourceDocumentId === anchorSourceDocumentId;
    }
    if (scope.startsWith("operative:")) {
      const docType = scope.slice("operative:".length);
      const view = operativeViews.find((item) => item.baseDocumentTypeId === docType);
      if (!view) {
        return false;
      }
      const ids = new Set([view.baseSourceDocumentId, ...view.amendmentSourceDocumentIds]);
      return ids.has(record.sourceDocumentId);
    }
    return true;
  });
}

function recordMatchesWhere(record: IndexedRecordVersion, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }
  for (const [key, expected] of Object.entries(where)) {
    if (key === "documentType") {
      const types = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      if (!record.documentTypeId || !types.includes(record.documentTypeId)) {
        return false;
      }
      continue;
    }
    const chip = record.provenanceByFieldKey[key];
    if (!chip) {
      return false;
    }
    const value = String(chip.normalized.normalizedValue ?? "");
    if (Array.isArray(expected)) {
      if (!expected.map(String).includes(value)) {
        return false;
      }
    } else if (value !== String(expected)) {
      return false;
    }
  }
  return true;
}

function joinFieldState(
  indexed: IndexedFoundation,
  record: IndexedRecordVersion,
  fieldId: string,
): "verified" | "empty" | "rejected" | "missing" {
  const chip = record.provenanceByFieldKey[fieldId];
  if (chip) {
    const value = chip.normalized.normalizedValue;
    if (value == null || value === "") {
      return "empty";
    }
    return "verified";
  }
  const rejected = indexed.foundation.rejectedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex &&
      field.fieldId === fieldId,
  );
  return rejected ? "rejected" : "missing";
}

function insightJoinKey(
  indexed: IndexedFoundation,
  record: IndexedRecordVersion,
  fieldId: string,
  joinOn: string,
): string | null {
  if (joinOn === "area_normalized") {
    return normalizedFieldValue(record, "area", indexed.pack);
  }
  if (joinOn === "text_normalized") {
    return normalizedFieldValue(record, fieldId, indexed.pack);
  }
  if (indexed.pack.constructs?.[joinOn]) {
    return buildConstructJoinKey(record, joinOn, indexed.pack);
  }
  return null;
}

function resolveFilteredOperand(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  operand: ProposalInsightOperand,
  anchorSourceDocumentId: string | null,
): CanonicalStudyProvenanceChip | null {
  if (!operand.record || !operand.field) {
    return null;
  }
  const matches = recordsInInsightScope(indexed, operativeViews, operand, anchorSourceDocumentId)
    .filter((record) => recordMatchesWhere(record, operand.where))
    .map((record) => record.provenanceByFieldKey[operand.field!])
    .filter((chip): chip is CanonicalStudyProvenanceChip => {
      if (!chip) {
        return false;
      }
      const value = chip.normalized.normalizedValue;
      return value != null && value !== "";
    })
    .sort((a, b) => {
      if (operand.pick === "latest") {
        return String(b.normalized.normalizedValue).localeCompare(String(a.normalized.normalizedValue));
      }
      return a.fieldKey.localeCompare(b.fieldKey);
    });
  return matches[0] ?? null;
}
```

## `engine/core/src/study/canonical-study/evaluate-primitives.ts`

```typescript
import type { ProposalDomainPack, ProposalRequirementWhen } from "@hiveforyou/domain-pack";
import type { CanonicalStudyProvenanceChip } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudySourceContext } from "@hiveforyou/shared/canonical-study-artifact";

import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { parsePackFieldPath } from "../canonical-study-foundation/field-key.js";

export type PrimitiveResult =
  | { ok: true; value?: unknown }
  | { ok: false; reason: string };

export function evaluateExists(
  indexed: IndexedFoundation,
  recordTypeId: string,
  fieldId: string,
  equals?: unknown,
): { found: boolean; chips: CanonicalStudyProvenanceChip[] } {
  const chips: CanonicalStudyProvenanceChip[] = [];
  for (const record of indexed.records) {
    if (record.recordTypeId !== recordTypeId) {
      continue;
    }
    const chip = record.provenanceByFieldKey[fieldId];
    if (!chip) {
      continue;
    }
    const value = chip.normalized.normalizedValue;
    if (equals !== undefined && value !== equals) {
      continue;
    }
    if (value == null || value === "") {
      continue;
    }
    chips.push(chip);
  }
  chips.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  return { found: chips.length > 0, chips };
}

export function evaluateWhenClause(
  when: ProposalRequirementWhen | undefined,
  indexed: IndexedFoundation,
  sourceContext: CanonicalStudySourceContext,
): PrimitiveResult {
  if (!when) {
    return { ok: true };
  }
  if (when.primitive === "exists") {
    if (!when.record || !when.field) {
      return { ok: false, reason: "exists_when_missing_record_or_field" };
    }
    const result = evaluateExists(indexed, when.record, when.field, when.equals);
    return result.found ? { ok: true } : { ok: false, reason: "applicability_false" };
  }
  if (when.primitive === "ageOnDate") {
    return { ok: false, reason: "ageOnDate_unresolved_reference_or_dates" };
  }
  return { ok: false, reason: `unsupported_when_primitive:${when.primitive}` };
}

export function resolvePackFieldValue(
  indexed: IndexedFoundation,
  path: string,
  scopeRecords: IndexedRecordVersion[],
): CanonicalStudyProvenanceChip | null {
  const parsed = parsePackFieldPath(path);
  if (!parsed) {
    return null;
  }
  for (const record of scopeRecords) {
    if (record.recordTypeId !== parsed.recordTypeId) {
      continue;
    }
    const chip = record.provenanceByFieldKey[parsed.fieldId];
    if (chip) {
      return chip;
    }
  }
  return null;
}

export function compareValuesPrimitive(
  left: CanonicalStudyProvenanceChip | null,
  right: CanonicalStudyProvenanceChip | null,
): PrimitiveResult {
  if (!left || !right) {
    return { ok: false, reason: "missing_operand" };
  }
  const leftVal = left.normalized.normalizedValue;
  const rightVal = right.normalized.normalizedValue;
  if (leftVal == null || rightVal == null) {
    return { ok: false, reason: "unverified_operand_value" };
  }
  const equal = JSON.stringify(leftVal) === JSON.stringify(rightVal);
  return { ok: true, value: { equal, left: leftVal, right: rightVal } };
}

export function elapsedSincePrimitive(
  left: CanonicalStudyProvenanceChip | null,
  right: CanonicalStudyProvenanceChip | null,
): PrimitiveResult {
  if (!left || !right) {
    return { ok: false, reason: "missing_operand" };
  }
  const start = left.normalized.normalizedValue;
  const end = right.normalized.normalizedValue;
  if (typeof start !== "string" || typeof end !== "string") {
    return { ok: false, reason: "operands_not_dates" };
  }
  if (start >= end) {
    return { ok: false, reason: "invalid_date_order" };
  }
  return { ok: true, value: { start, end } };
}

export function lookupReferenceTable(
  pack: ProposalDomainPack,
  sourceContext: CanonicalStudySourceContext,
  tableId: string,
): unknown[] {
  const override = sourceContext.referenceTables?.[tableId]?.rows;
  if (override) {
    return override;
  }
  const entry = pack.referenceTables?.entries?.find((item) => item.id === tableId);
  return entry?.rows ?? [];
}
```

## `engine/core/src/study/canonical-study/evaluate-requirements.ts`

```typescript
import type {
  CanonicalStudyOperativeView,
  CanonicalStudyRequirementFieldResult,
  CanonicalStudyRequirementOutcome,
  CanonicalStudyRequirementResult,
} from "@hiveforyou/shared/canonical-study-artifact";

import { evaluateWhenClause, evaluateExists } from "./evaluate-primitives.js";
import {
  evaluateScopeSourceCoverage,
  type SourceCoverageGateMode,
} from "./evaluate-source-coverage.js";
import type { IndexedFoundation } from "./indexed-foundation.js";
import { stableId } from "./stable-id.js";

function recordsInScope(
  indexed: IndexedFoundation,
  operativeViews: CanonicalStudyOperativeView[],
  appliesTo: string | undefined,
): { sourceDocumentIds: Set<string>; operativeView: CanonicalStudyOperativeView | null } {
  if (!appliesTo) {
    return { sourceDocumentIds: new Set(indexed.records.map((record) => record.sourceDocumentId)), operativeView: null };
  }

  if (appliesTo.startsWith("operative:")) {
    const docTypeId = appliesTo.slice("operative:".length);
    const view = operativeViews.find((item) => item.baseDocumentTypeId === docTypeId) ?? operativeViews[0] ?? null;
    if (!view) {
      return { sourceDocumentIds: new Set(), operativeView: null };
    }
    const ids = new Set<string>([view.baseSourceDocumentId, ...view.amendmentSourceDocumentIds]);
    return { sourceDocumentIds: ids, operativeView: view };
  }

  if (appliesTo.startsWith("each:")) {
    const docTypeId = appliesTo.slice("each:".length);
    const ids = new Set(
      indexed.records
        .filter((record) => record.documentTypeId === docTypeId)
        .map((record) => record.sourceDocumentId),
    );
    return { sourceDocumentIds: ids, operativeView: null };
  }

  return { sourceDocumentIds: new Set(), operativeView: null };
}

function unresolvedForIncompleteCoverage(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
  mode?: SourceCoverageGateMode;
}): { outcome: CanonicalStudyRequirementOutcome; evidence: []; message: string } | null {
  const coverage = evaluateScopeSourceCoverage(input);
  if (coverage.complete) {
    return null;
  }
  return {
    outcome: "UNRESOLVED",
    evidence: [],
    message: coverage.message,
  };
}

function aggregateFieldResults(
  indexed: IndexedFoundation,
  matchingRecords: IndexedFoundation["records"],
  fieldIds: string[],
): CanonicalStudyRequirementFieldResult[] {
  const results = new Map<string, CanonicalStudyRequirementFieldResult["status"]>();
  for (const fieldId of fieldIds) {
    results.set(fieldId, "missing");
  }
  for (const record of matchingRecords) {
    for (const fieldId of fieldIds) {
      const state = fieldState(indexed, record, fieldId);
      const current = results.get(fieldId) ?? "missing";
      if (state.kind === "verified") {
        results.set(fieldId, "verified");
        continue;
      }
      if (current === "verified") {
        continue;
      }
      if (state.kind === "rejected") {
        results.set(fieldId, "rejected");
        continue;
      }
      if (state.kind === "empty" && current === "missing") {
        results.set(fieldId, "empty");
      }
    }
  }
  return [...results.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldId, status]) => ({ fieldId, status }));
}

function evaluateCheck(input: {
  indexed: IndexedFoundation;
  recordTypeId: string;
  fieldIds: string[];
  scopeDocumentIds: Set<string>;
  minCount?: number;
  forEach?: boolean;
  pageTerms?: string[];
  appliesTo?: string;
}): {
  outcome: CanonicalStudyRequirementOutcome;
  evidence: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
  message: string;
} {
  const coverageBlocked = unresolvedForIncompleteCoverage({
    indexed: input.indexed,
    scopeDocumentIds: input.scopeDocumentIds,
    appliesTo: input.appliesTo,
  });
  if (coverageBlocked) {
    return coverageBlocked;
  }

  const matchingRecords = input.indexed.records.filter(
    (record) =>
      record.recordTypeId === input.recordTypeId && input.scopeDocumentIds.has(record.sourceDocumentId),
  );

  if (matchingRecords.length === 0) {
    return absenceAfterPageReview(input);
  }

  if (input.fieldIds.length === 0) {
    const requiredCount = input.minCount ?? 1;
    if (matchingRecords.length >= requiredCount) {
      return { outcome: "PRESENT", evidence: [], message: "presence_check_only:verified" };
    }
    return absenceAfterPageReview(input);
  }

  const evidence = [];
  const missing = new Set<string>();
  const rejected = new Set<string>();
  const empty = new Set<string>();
  let completeRecords = 0;

  for (const record of matchingRecords) {
    let complete = true;
    for (const fieldId of input.fieldIds) {
      const state = fieldState(input.indexed, record, fieldId);
      if (state.kind === "verified") {
        evidence.push(state.chip);
        continue;
      }
      complete = false;
      if (state.kind === "empty") {
        empty.add(fieldId);
      } else if (state.kind === "rejected") {
        rejected.add(fieldId);
      } else {
        missing.add(fieldId);
      }
    }
    if (complete) {
      completeRecords += 1;
    }
  }

  evidence.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  const requiredCount = input.forEach ? matchingRecords.length : (input.minCount ?? 1);
  const fieldResults =
    input.fieldIds.length > 0
      ? aggregateFieldResults(input.indexed, matchingRecords, input.fieldIds)
      : undefined;
  if (completeRecords >= requiredCount && completeRecords > 0) {
    return { outcome: "PRESENT", evidence, fieldResults, message: "presence_check_only:verified" };
  }
  if (rejected.size > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence,
      fieldResults,
      message: `presence_check_only:verification_rejected:${[...rejected].sort().join(",")}`,
    };
  }
  if (evidence.length > 0 && matchingRecords.length > 0 && (missing.size > 0 || empty.size > 0)) {
    const partialFields = [...missing, ...empty].sort();
    return {
      outcome: "PRESENT_WITH_MISSING_FIELDS",
      evidence,
      fieldResults,
      message: `presence_check_only:partially_verified:${partialFields.join(",")}`,
    };
  }
  if (missing.size > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence,
      fieldResults,
      message: `presence_check_only:explicitly_missing:${[...missing].sort().join(",")}`,
    };
  }
  if (empty.size > 0) {
    return {
      outcome: "FIELD_PRESENT_BUT_EMPTY",
      evidence,
      fieldResults,
      message: `presence_check_only:explicitly_empty:${[...empty].sort().join(",")}`,
    };
  }
  return absenceAfterPageReview({ ...input, evidence, fieldResults });
}

function fieldState(
  indexed: IndexedFoundation,
  record: IndexedFoundation["records"][number],
  fieldId: string,
):
  | { kind: "verified"; chip: ReturnType<typeof evaluateExists>["chips"][number] }
  | { kind: "empty" | "rejected" | "missing" } {
  const chip = record.provenanceByFieldKey[fieldId];
  if (chip) {
    const value = chip.normalized.normalizedValue;
    if (value == null || value === "") {
      return { kind: "empty" };
    }
    return { kind: "verified", chip };
  }
  const rejected = indexed.foundation.rejectedFields.some(
    (field) =>
      field.sourceDocumentId === record.sourceDocumentId &&
      field.recordTypeId === record.recordTypeId &&
      field.instanceIndex === record.instanceIndex &&
      field.fieldId === fieldId,
  );
  return { kind: rejected ? "rejected" : "missing" };
}

function absenceAfterPageReview(input: {
  indexed: IndexedFoundation;
  recordTypeId: string;
  scopeDocumentIds: Set<string>;
  pageTerms?: string[];
  appliesTo?: string;
  evidence?: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
}): {
  outcome: CanonicalStudyRequirementOutcome;
  evidence: ReturnType<typeof evaluateExists>["chips"];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
  message: string;
} {
  const coverageBlocked = unresolvedForIncompleteCoverage({
    indexed: input.indexed,
    scopeDocumentIds: input.scopeDocumentIds,
    appliesTo: input.appliesTo,
    mode: "absence",
  });
  if (coverageBlocked) {
    return { ...coverageBlocked, evidence: input.evidence ?? [], fieldResults: input.fieldResults };
  }

  const documents = input.indexed.foundation.documents.filter((document) => {
    if (input.scopeDocumentIds.size > 0) {
      return input.scopeDocumentIds.has(document.sourceDocumentId);
    }
    if (input.appliesTo?.startsWith("operative:") || input.appliesTo?.startsWith("each:")) {
      const typeId = input.appliesTo.slice(input.appliesTo.indexOf(":") + 1);
      return document.documentTypeId === typeId;
    }
    return true;
  });

  if (documents.length === 0 || documents.some((document) => !document.trustedPagesSupplied)) {
    return {
      outcome: "UNRESOLVED",
      evidence: input.evidence ?? [],
      message: "presence_check_only:source_pages_unavailable",
    };
  }

  const hits = (input.pageTerms ?? []).filter((term) =>
    documents.some((document) => document.matchedPageTerms.includes(term)),
  );
  if (hits.length > 0) {
    return {
      outcome: "UNRESOLVED",
      evidence: input.evidence ?? [],
      message: `presence_check_only:source_page_mentions_unverified:${hits.sort().join(",")}`,
    };
  }

  return {
    outcome: "NOT_FOUND_IN_SUPPLIED_DOCUMENTS",
    evidence: input.evidence ?? [],
    message: "presence_check_only:not_found_after_page_review",
  };
}

export function evaluateRequirements(input: {
  indexed: IndexedFoundation;
  operativeViews: CanonicalStudyOperativeView[];
}): CanonicalStudyRequirementResult[] {
  const rules = input.indexed.pack.requirements?.rules ?? [];
  const results: CanonicalStudyRequirementResult[] = [];

  for (const rule of rules) {
    const whenResult = evaluateWhenClause(rule.when, input.indexed, input.indexed.sourceContext);
    if (!whenResult.ok && whenResult.reason === "applicability_false") {
      results.push({
        id: stableId(`requirement:${rule.id}:na`),
        ruleId: rule.id,
        outcome: "NOT_APPLICABLE",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: "Applicability condition verified false.",
      });
      continue;
    }
    if (!whenResult.ok) {
      results.push({
        id: stableId(`requirement:${rule.id}:unresolved`),
        ruleId: rule.id,
        outcome: "UNRESOLVED",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: whenResult.reason,
      });
      continue;
    }

    const scope = recordsInScope(input.indexed, input.operativeViews, rule.appliesTo);
    if (scope.sourceDocumentIds.size === 0 && rule.appliesTo?.startsWith("operative:")) {
      results.push({
        id: stableId(`requirement:${rule.id}:na`),
        ruleId: rule.id,
        outcome: "NOT_APPLICABLE",
        scope: rule.appliesTo ?? "",
        evidence: [],
        message: "No operative view for declared scope.",
      });
      continue;
    }

    for (const check of rule.checks ?? []) {
      const evaluated = evaluateCheck({
        indexed: input.indexed,
        recordTypeId: check.record,
        fieldIds: check.fields ?? [],
        scopeDocumentIds: scope.sourceDocumentIds,
        minCount: check.minCount,
        forEach: check.forEach,
        pageTerms: check.pageTerms,
        appliesTo: rule.appliesTo,
      });
      results.push({
        id: stableId(`requirement:${rule.id}:${check.record}:${(check.fields ?? []).join(",")}`),
        ruleId: rule.id,
        outcome: evaluated.outcome,
        scope: rule.appliesTo ?? "",
        evidence: evaluated.evidence,
        fieldResults: evaluated.fieldResults,
        message: evaluated.message,
      });
    }
  }

  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
}
```

## `engine/core/src/study/canonical-study/evaluate-source-coverage.ts`

```typescript
import type { ProposalInsightOperand } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyDocumentExtractionStatus,
  CanonicalStudyFoundationDocumentOrder,
} from "@hiveforyou/shared/canonical-study-foundation";

import type { IndexedFoundation } from "./indexed-foundation.js";

export type SourceCoverageGateMode = "extraction" | "absence";

export type SourceCoverageEvaluation = {
  complete: boolean;
  incompleteDocumentIds: string[];
  unresolvedClassificationDocumentIds: string[];
  message: string;
};

export function isExtractionReadable(
  status: CanonicalStudyDocumentExtractionStatus,
): boolean {
  return status === "SUCCEEDED";
}

export function isClassificationResolved(
  status: CanonicalStudyFoundationDocumentOrder["classificationStatus"],
): boolean {
  return status === "classified";
}

export function resolveClassificationStatus(
  documentTypeId: string | null | undefined,
): CanonicalStudyFoundationDocumentOrder["classificationStatus"] {
  if (documentTypeId == null || documentTypeId === "") {
    return "unclassified";
  }
  if (documentTypeId === "UNKNOWN") {
    return "unknown";
  }
  if (documentTypeId === "AMBIGUOUS") {
    return "ambiguous";
  }
  return "classified";
}

export function isDocumentPotentiallyInScope(
  indexed: IndexedFoundation,
  sourceDocumentId: string,
): boolean {
  const logicalDocuments = indexed.sourceContext.logicalDocuments;
  if (!logicalDocuments || logicalDocuments.length === 0) {
    return true;
  }
  return logicalDocuments.some((doc) => doc.sourceDocumentId === sourceDocumentId);
}

function isPotentiallyRelevantToDocumentType(
  document: CanonicalStudyFoundationDocumentOrder,
  typeId: string,
): boolean {
  if (document.documentTypeId === typeId) {
    return true;
  }
  if (document.documentTypeId == null || document.documentTypeId === "") {
    return true;
  }
  return (
    document.classificationStatus === "unclassified" ||
    document.classificationStatus === "unknown" ||
    document.classificationStatus === "ambiguous"
  );
}

function scopedDocuments(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
}): CanonicalStudyFoundationDocumentOrder[] {
  const allDocuments = input.indexed.foundation.documents;
  if (input.appliesTo?.startsWith("operative:") || input.appliesTo?.startsWith("each:")) {
    const typeId = input.appliesTo.slice(input.appliesTo.indexOf(":") + 1);
    return allDocuments.filter(
      (document) =>
        isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId) &&
        isPotentiallyRelevantToDocumentType(document, typeId),
    );
  }
  if (input.scopeDocumentIds.size > 0) {
    return allDocuments.filter((document) => input.scopeDocumentIds.has(document.sourceDocumentId));
  }
  return allDocuments.filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );
}

function documentsForOperandScope(input: {
  indexed: IndexedFoundation;
  operand: ProposalInsightOperand;
  anchorSourceDocumentId: string | null;
}): CanonicalStudyFoundationDocumentOrder[] {
  const scope = input.operand.scope;
  if (scope?.startsWith("operative:") || scope?.startsWith("each:")) {
    const typeId = scope.slice(scope.indexOf(":") + 1);
    return input.indexed.foundation.documents.filter(
      (document) =>
        isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId) &&
        isPotentiallyRelevantToDocumentType(document, typeId),
    );
  }
  if (scope === "same_document" && input.anchorSourceDocumentId) {
    return input.indexed.foundation.documents.filter(
      (document) => document.sourceDocumentId === input.anchorSourceDocumentId,
    );
  }
  return input.indexed.foundation.documents.filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );
}

function buildSourceCoverageMessage(input: {
  incompleteDocumentIds: string[];
  unresolvedClassificationDocumentIds: string[];
}): string {
  const messageParts: string[] = [];
  if (input.incompleteDocumentIds.length > 0) {
    messageParts.push(`source_extraction_incomplete:${input.incompleteDocumentIds.join(",")}`);
  }
  if (input.unresolvedClassificationDocumentIds.length > 0) {
    messageParts.push(
      `source_classification_unresolved:${input.unresolvedClassificationDocumentIds.join(",")}`,
    );
  }
  return messageParts.join(";");
}

function evaluateDocumentsSourceCoverage(
  documents: CanonicalStudyFoundationDocumentOrder[],
  mode: SourceCoverageGateMode,
): SourceCoverageEvaluation {
  const incompleteDocumentIds = documents
    .filter((document) => !isExtractionReadable(document.extractionStatus))
    .map((document) => document.sourceDocumentId)
    .sort((a, b) => a.localeCompare(b));

  if (incompleteDocumentIds.length > 0) {
    return {
      complete: false,
      incompleteDocumentIds,
      unresolvedClassificationDocumentIds: [],
      message: buildSourceCoverageMessage({ incompleteDocumentIds, unresolvedClassificationDocumentIds: [] }),
    };
  }

  const unresolvedClassificationDocumentIds =
    mode === "absence"
      ? documents
          .filter((document) => !isClassificationResolved(document.classificationStatus))
          .map((document) => document.sourceDocumentId)
          .sort((a, b) => a.localeCompare(b))
      : [];

  if (unresolvedClassificationDocumentIds.length > 0) {
    return {
      complete: false,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds,
      message: buildSourceCoverageMessage({ incompleteDocumentIds: [], unresolvedClassificationDocumentIds }),
    };
  }

  return {
    complete: true,
    incompleteDocumentIds: [],
    unresolvedClassificationDocumentIds: [],
    message: "",
  };
}

export function evaluateScopeSourceCoverage(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
  mode?: SourceCoverageGateMode;
}): SourceCoverageEvaluation {
  const documents = scopedDocuments(input).filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );

  return evaluateDocumentsSourceCoverage(documents, input.mode ?? "extraction");
}

export function evaluateInsightOperandSourceCoverage(input: {
  indexed: IndexedFoundation;
  operand: ProposalInsightOperand | undefined;
  anchorSourceDocumentId: string | null;
  scopeDocumentIds?: Set<string>;
  mode?: SourceCoverageGateMode;
}): SourceCoverageEvaluation {
  const operand = input.operand;
  if (!operand) {
    return {
      complete: true,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds: [],
      message: "",
    };
  }

  const records = input.indexed.records.filter((record) => {
    if (operand.record && record.recordTypeId !== operand.record) {
      return false;
    }
    if (input.scopeDocumentIds && input.scopeDocumentIds.size > 0) {
      return input.scopeDocumentIds.has(record.sourceDocumentId);
    }
    const scope = operand.scope;
    if (!scope) {
      return true;
    }
    if (scope === "same_document") {
      return (
        input.anchorSourceDocumentId == null || record.sourceDocumentId === input.anchorSourceDocumentId
      );
    }
    if (scope.startsWith("operative:")) {
      const docType = scope.slice("operative:".length);
      return record.documentTypeId === docType;
    }
    return true;
  });

  const sourceDocumentIds = new Set(records.map((record) => record.sourceDocumentId));
  if (input.anchorSourceDocumentId) {
    sourceDocumentIds.add(input.anchorSourceDocumentId);
  }
  if (sourceDocumentIds.size === 0 && input.anchorSourceDocumentId) {
    sourceDocumentIds.add(input.anchorSourceDocumentId);
  }

  const operandDocuments = documentsForOperandScope({
    indexed: input.indexed,
    operand,
    anchorSourceDocumentId: input.anchorSourceDocumentId,
  });
  const documents =
    operandDocuments.length > 0
      ? operandDocuments
      : input.indexed.foundation.documents.filter(
          (document) =>
            sourceDocumentIds.has(document.sourceDocumentId) &&
            isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
        );

  return evaluateDocumentsSourceCoverage(documents, input.mode ?? "extraction");
}

export function mergeSourceCoverageEvaluations(
  evaluations: SourceCoverageEvaluation[],
): SourceCoverageEvaluation {
  const incompleteDocumentIds = [
    ...new Set(evaluations.flatMap((evaluation) => evaluation.incompleteDocumentIds)),
  ].sort((a, b) => a.localeCompare(b));
  const unresolvedClassificationDocumentIds = [
    ...new Set(evaluations.flatMap((evaluation) => evaluation.unresolvedClassificationDocumentIds)),
  ].sort((a, b) => a.localeCompare(b));

  if (incompleteDocumentIds.length === 0 && unresolvedClassificationDocumentIds.length === 0) {
    return {
      complete: true,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds: [],
      message: "",
    };
  }

  return {
    complete: false,
    incompleteDocumentIds,
    unresolvedClassificationDocumentIds,
    message: buildSourceCoverageMessage({ incompleteDocumentIds, unresolvedClassificationDocumentIds }),
  };
}
```

## `engine/core/src/study/canonical-study/hash-body.ts`

```typescript
import type { CanonicalStudyArtifactBody } from "@hiveforyou/shared/canonical-study-artifact";

import { hashCanonicalJson } from "../fingerprint.js";

export function hashCanonicalStudyBody(body: CanonicalStudyArtifactBody): string {
  return hashCanonicalJson(body);
}
```

## `engine/core/src/study/canonical-study/index.ts`

```typescript
import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import {
  CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
  type CanonicalStudySourceContext,
} from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyFoundationArtifact } from "@hiveforyou/shared/canonical-study-foundation";
import {
  CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION,
} from "@hiveforyou/shared/canonical-study-foundation";
import { hashCanonicalStudyFoundationBody } from "../canonical-study-foundation/hash-body.js";

import { buildSeries } from "./build-series.js";
import { composeOperativeViews } from "./compose-operative-views.js";
import { evaluateInsightChecks } from "./evaluate-insight-checks.js";
import { evaluateRequirements } from "./evaluate-requirements.js";
import { hashCanonicalStudyBody } from "./hash-body.js";
import { buildIndexedFoundation } from "./indexed-foundation.js";
import { labelRelations } from "./label-relations.js";
import { resolveIdentity } from "./resolve-identity.js";

/** Deterministic canonical study builder identity (separate from Reader Domain Pack snapshots). */
export const CANONICAL_STUDY_RULESET_ID = "hive.canonical-study.deterministic" as const;

/** Pinned hash of canonical study builder modules (foundation + artifact builders). */
export const CANONICAL_STUDY_RULESET_CONTENT_SHA256 =
  "ef01462fc144a0b971d41a867905b698b35b1028dd0322c6341d05cfa2803140" as const;

export type CanonicalStudyRulesetIdentity = {
  rulesetId: typeof CANONICAL_STUDY_RULESET_ID;
  rulesetVersion: string;
  rulesetContentSha256: typeof CANONICAL_STUDY_RULESET_CONTENT_SHA256;
  foundationSchemaVersion: typeof CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION;
  artifactSchemaVersion: typeof CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION;
};

export function resolveCanonicalStudyRulesetIdentity(): CanonicalStudyRulesetIdentity {
  return {
    rulesetId: CANONICAL_STUDY_RULESET_ID,
    rulesetVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
    rulesetContentSha256: CANONICAL_STUDY_RULESET_CONTENT_SHA256,
    foundationSchemaVersion: CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION,
    artifactSchemaVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
  };
}

export type BuildCanonicalStudyInput = {
  /** Merged or reader pack used for identity, insights, and requirements evaluation. */
  pack: ProposalDomainPack;
  /** Reader extraction pack hash — must match foundation.packContentSha256. */
  packContentSha256: string;
  interpretationRulesetId?: string | null;
  interpretationRulesetContentSha256?: string | null;
  foundation: CanonicalStudyFoundationArtifact;
  sourceContext?: CanonicalStudySourceContext;
  createdAt?: string;
};

function validatePackFoundationConsistency(input: BuildCanonicalStudyInput): void {
  if (input.pack.manifest.id !== input.foundation.packId) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packId");
  }
  if (input.pack.manifest.version !== input.foundation.packVersion) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packVersion");
  }
  const readerHash = input.packContentSha256.toLowerCase();
  if (readerHash !== input.foundation.packContentSha256.toLowerCase()) {
    throw new Error("CANONICAL_STUDY_PACK_MISMATCH:packContentSha256");
  }
  const recomputed = hashCanonicalStudyFoundationBody({
    schemaVersion: input.foundation.schemaVersion,
    packId: input.foundation.packId,
    packVersion: input.foundation.packVersion,
    packContentSha256: input.foundation.packContentSha256,
    studyRunId: input.foundation.studyRunId,
    attemptId: input.foundation.attemptId,
    caseId: input.foundation.caseId,
    counts: input.foundation.counts,
    documents: input.foundation.documents,
    groupedRecords: input.foundation.groupedRecords,
    verifiedFields: input.foundation.verifiedFields,
    rejectedFields: input.foundation.rejectedFields,
    unresolvedFields: input.foundation.unresolvedFields,
    unresolvedItems: input.foundation.unresolvedItems,
  });
  if (recomputed !== input.foundation.contentSha256) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_HASH_MISMATCH");
  }
}

export function buildCanonicalStudy(input: BuildCanonicalStudyInput): CanonicalStudyArtifact {
  validatePackFoundationConsistency(input);

  const sourceContext: CanonicalStudySourceContext = input.sourceContext ?? {};
  const indexed = buildIndexedFoundation({
    pack: input.pack,
    foundation: input.foundation,
    sourceContext,
  });

  const { entities, possiblySameLinks, orphans, orphanItems } = resolveIdentity(indexed);
  const { operativeViews, documentLineage } = composeOperativeViews({ indexed, entities });
  const { relations, unresolvedComparisons } = labelRelations({ indexed, entities });
  const series = buildSeries({ indexed, entities });
  const requirements = evaluateRequirements({ indexed, operativeViews });
  const flags = evaluateInsightChecks({ indexed, operativeViews, series });

  const asOfDate = sourceContext.asOfDate ?? null;

  const body = {
    schemaVersion: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION,
    packId: input.foundation.packId,
    packVersion: input.foundation.packVersion,
    packContentSha256: input.foundation.packContentSha256,
    interpretationRulesetId: input.interpretationRulesetId ?? null,
    interpretationRulesetContentSha256: input.interpretationRulesetContentSha256 ?? null,
    foundationContentSha256: input.foundation.contentSha256,
    studyRunId: input.foundation.studyRunId,
    attemptId: input.foundation.attemptId,
    caseId: input.foundation.caseId,
    asOfDate,
    documents: input.foundation.documents.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      documentTypeId: doc.documentTypeId,
      sortRank: doc.sortRank,
      verifiedOrderingDate: doc.verifiedOrderingDate,
      extractionStatus: doc.extractionStatus,
      classificationStatus: doc.classificationStatus,
      trustedPagesSupplied: doc.trustedPagesSupplied,
    })),
    documentLineage,
    entities,
    operativeViews,
    relations,
    unresolvedComparisons,
    series,
    requirements,
    flags,
    possiblySameLinks,
    unresolvedItems: [...input.foundation.unresolvedItems, ...orphanItems].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    rejectedFields: input.foundation.rejectedFields,
    orphans,
    counts: {
      entities: entities.length,
      entityIdentityUnresolved: entities.filter((entity) => entity.status === "identity_unresolved").length,
      operativeViews: operativeViews.length,
      relations: relations.length,
      unresolvedComparisons: unresolvedComparisons.length,
      series: series.length,
      requirements: requirements.length,
      flags: flags.length,
      possiblySameLinks: possiblySameLinks.length,
      unresolvedItems: input.foundation.unresolvedItems.length + orphanItems.length,
      rejectedFields: input.foundation.rejectedFields.length,
      orphans: orphans.length,
    },
  };

  const contentSha256 = hashCanonicalStudyBody(body);
  return {
    ...body,
    createdAt: input.createdAt ?? new Date(0).toISOString(),
    contentSha256,
  };
}

export { buildIndexedFoundation } from "./indexed-foundation.js";
export { resolveIdentity } from "./resolve-identity.js";
export { composeOperativeViews } from "./compose-operative-views.js";
export { labelRelations } from "./label-relations.js";
export { buildSeries } from "./build-series.js";
export { evaluateRequirements } from "./evaluate-requirements.js";
export { evaluateInsightChecks } from "./evaluate-insight-checks.js";
export {
  evaluateScopeSourceCoverage,
  isDocumentPotentiallyInScope,
  isExtractionReadable,
  resolveClassificationStatus,
} from "./evaluate-source-coverage.js";
```

## `engine/core/src/study/canonical-study/indexed-foundation.ts`

```typescript
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
```

## `engine/core/src/study/canonical-study/label-relations.ts`

```typescript
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
```

## `engine/core/src/study/canonical-study/resolve-identity.ts`

```typescript
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
```

## `engine/core/src/study/canonical-study/stable-id.ts`

```typescript
import { createHash } from "node:crypto";

export function stableId(material: string): string {
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
```

## `engine/core/src/study/canonical-study/temporal-succession.ts`

```typescript
import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveRelationshipRules } from "./indexed-foundation.js";

export function temporalDateForRecord(
  record: IndexedRecordVersion,
  indexed: IndexedFoundation,
): string | null {
  const rules = resolveRelationshipRules(indexed.pack);
  for (const fieldId of rules.temporalSuccessionFieldIds) {
    const chip = record.provenanceByFieldKey[fieldId];
    const value = chip?.normalized.normalizedValue;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

/** Verified temporal succession — document ordering date alone is insufficient when configured. */
export function hasVerifiedTemporalSuccession(
  earlier: IndexedRecordVersion,
  later: IndexedRecordVersion,
  indexed: IndexedFoundation,
): { ok: boolean; basis: string | null } {
  const rules = resolveRelationshipRules(indexed.pack);
  const earlierEvent = temporalDateForRecord(earlier, indexed);
  const laterEvent = temporalDateForRecord(later, indexed);

  if (earlierEvent && laterEvent && earlierEvent < laterEvent) {
    return { ok: true, basis: `event_dates:${earlierEvent}->${laterEvent}` };
  }

  if (!rules.changeRequiresTemporalSuccession) {
    if (
      earlier.orderingDate &&
      later.orderingDate &&
      earlier.orderingDate < later.orderingDate
    ) {
      return { ok: true, basis: `ordering_dates:${earlier.orderingDate}->${later.orderingDate}` };
    }
  }

  return { ok: false, basis: null };
}
```

## `engine/shared/src/canonical-study-artifact.ts`

```typescript
export const CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION = "hive.canonical-study/1" as const;

import type {
  CanonicalStudyDocumentClassificationStatus,
  CanonicalStudyDocumentExtractionStatus,
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationEnvelopeRef,
  CanonicalStudyFoundationNormalizedValue,
  CanonicalStudyFoundationRejectedField,
  CanonicalStudyFoundationUnresolvedItem,
} from "./canonical-study-foundation.js";

/** Trusted metadata supplied by the caller — no fetching inside the engine. */
export type CanonicalStudySourceContext = {
  logicalDocuments?: Array<{
    sourceDocumentId: string;
    logicalDocumentId?: string;
    filename?: string;
  }>;
  jurisdiction?: string;
  referenceTables?: Record<string, { rows: unknown[] }>;
  /** Study qualification or reporting anchor date supplied by the caller. */
  asOfDate?: string;
};

export type CanonicalStudyProvenanceChip = {
  fieldKey: string;
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
  evidence: CanonicalStudyFoundationEvidence[];
  normalized: CanonicalStudyFoundationNormalizedValue;
  envelopeRef: CanonicalStudyFoundationEnvelopeRef;
};

export type CanonicalStudyRecordVersion = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  documentTypeId: string | null;
  orderingDate: string | null;
  party: string | null;
  fieldKeys: string[];
  provenanceByFieldKey: Record<string, CanonicalStudyProvenanceChip>;
};

export type CanonicalStudyEntityStatus = "resolved" | "identity_unresolved";

export type CanonicalStudyEntity = {
  id: string;
  recordTypeId: string;
  status: CanonicalStudyEntityStatus;
  contentKey: string | null;
  recordVersions: CanonicalStudyRecordVersion[];
  reasons: string[];
};

export type CanonicalStudyPossiblySameLink = {
  id: string;
  leftEntityId: string;
  rightEntityId: string;
  recordTypeId: string;
  reason: string;
  leftProvenance: CanonicalStudyProvenanceChip[];
  rightProvenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudyDocumentLineageEdge = {
  id: string;
  kind: "amends" | "supersedes";
  fromSourceDocumentId: string;
  toSourceDocumentId: string;
  status: "linked" | "unresolved";
};

export type CanonicalStudyOperativeSlotStatus =
  | "operative"
  | "historical"
  | "conflicted"
  | "unresolved";

export type CanonicalStudyOperativeFieldValue = {
  fieldId: string;
  status: CanonicalStudyOperativeSlotStatus;
  provenance: CanonicalStudyProvenanceChip | null;
  competingProvenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudyOperativeRecord = {
  entityId: string;
  recordTypeId: string;
  contentKey: string | null;
  fields: CanonicalStudyOperativeFieldValue[];
  sourceRecordGroupIds: string[];
};

export type CanonicalStudyOperativeView = {
  id: string;
  baseDocumentTypeId: string;
  baseSourceDocumentId: string;
  amendmentSourceDocumentIds: string[];
  status: "resolved" | "conflicted" | "unresolved";
  records: CanonicalStudyOperativeRecord[];
  unresolvedItems: string[];
};

export type CanonicalStudyRelationLabel =
  | "MATCHES"
  | "UNCHANGED"
  | "CHANGE"
  | "CONFLICT";

export type CanonicalStudyRelation = {
  id: string;
  label: CanonicalStudyRelationLabel;
  entityId: string;
  fieldId: string;
  left: CanonicalStudyProvenanceChip;
  right: CanonicalStudyProvenanceChip;
  temporalBasis: string | null;
  partyBasis: string | null;
};

export type CanonicalStudyUnresolvedComparison = {
  id: string;
  entityId: string;
  fieldId: string;
  left: CanonicalStudyProvenanceChip;
  right: CanonicalStudyProvenanceChip;
  reason: string;
};

export type CanonicalStudySeriesObservation = {
  orderingRank: number;
  role: string;
  observedDate: string | null;
  value: CanonicalStudyFoundationNormalizedValue;
  provenance: CanonicalStudyProvenanceChip;
  corroboratingProvenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudySeries = {
  id: string;
  entityId: string;
  sourceEntityIds: string[];
  constructId: string;
  dimensionKey: string;
  observations: CanonicalStudySeriesObservation[];
  unresolvedReasons: string[];
};

export type CanonicalStudyOrphanRecord = {
  id: string;
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  status: "rejected" | "unresolved";
  reason: string;
  fieldKeys: string[];
  provenance: CanonicalStudyProvenanceChip[];
};

export type CanonicalStudyRequirementOutcome =
  | "PRESENT"
  | "PRESENT_WITH_MISSING_FIELDS"
  | "FIELD_PRESENT_BUT_EMPTY"
  | "NOT_FOUND_IN_SUPPLIED_DOCUMENTS"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

export type CanonicalStudyRequirementFieldResult = {
  fieldId: string;
  status: "verified" | "empty" | "rejected" | "missing";
};

export type CanonicalStudyRequirementResult = {
  id: string;
  ruleId: string;
  outcome: CanonicalStudyRequirementOutcome;
  scope: string;
  evidence: CanonicalStudyProvenanceChip[];
  fieldResults?: CanonicalStudyRequirementFieldResult[];
  message: string;
};

export type CanonicalStudyFlagStatus = "fired" | "unresolved" | "unsupported";

export type CanonicalStudyFlag = {
  id: string;
  checkId: string;
  status: CanonicalStudyFlagStatus;
  question: string;
  operands: CanonicalStudyProvenanceChip[];
  message: string;
};

export type CanonicalStudyCounts = {
  entities: number;
  entityIdentityUnresolved: number;
  operativeViews: number;
  relations: number;
  unresolvedComparisons: number;
  series: number;
  requirements: number;
  flags: number;
  possiblySameLinks: number;
  unresolvedItems: number;
  rejectedFields: number;
  orphans: number;
};

export type CanonicalStudyArtifactBody = {
  schemaVersion: typeof CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  /** Reader extraction Domain Pack content hash (envelope pins). */
  packContentSha256: string;
  /** Canonical study interpretation overlay hash, when used. */
  interpretationRulesetId?: string | null;
  interpretationRulesetContentSha256?: string | null;
  foundationContentSha256: string;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  asOfDate: string | null;
  documents: Array<{
    sourceDocumentId: string;
    documentTypeId: string | null;
    sortRank: number;
    verifiedOrderingDate: string | null;
    extractionStatus: CanonicalStudyDocumentExtractionStatus;
    classificationStatus: CanonicalStudyDocumentClassificationStatus;
    trustedPagesSupplied: boolean;
  }>;
  documentLineage: CanonicalStudyDocumentLineageEdge[];
  entities: CanonicalStudyEntity[];
  operativeViews: CanonicalStudyOperativeView[];
  relations: CanonicalStudyRelation[];
  unresolvedComparisons: CanonicalStudyUnresolvedComparison[];
  series: CanonicalStudySeries[];
  requirements: CanonicalStudyRequirementResult[];
  flags: CanonicalStudyFlag[];
  possiblySameLinks: CanonicalStudyPossiblySameLink[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
  rejectedFields: CanonicalStudyFoundationRejectedField[];
  orphans: CanonicalStudyOrphanRecord[];
  counts: CanonicalStudyCounts;
};

export type CanonicalStudyArtifact = CanonicalStudyArtifactBody & {
  createdAt: string;
  contentSha256: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCanonicalStudyArtifact(raw: unknown): CanonicalStudyArtifact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("CANONICAL_STUDY_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION) {
    throw new Error("CANONICAL_STUDY_INVALID: schemaVersion");
  }
  if (!isNonEmptyString(record.contentSha256)) {
    throw new Error("CANONICAL_STUDY_INVALID: contentSha256");
  }
  return raw as CanonicalStudyArtifact;
}
```

## `engine/shared/src/canonical-study-foundation.ts`

```typescript
import type { ReaderDocumentExtractionStatus } from "./reader-document-extraction.js";

export const CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION =
  "hive.canonical-study-foundation/1" as const;

/** Extraction outcome carried into canonical study (includes missing envelope). */
export type CanonicalStudyDocumentExtractionStatus =
  | ReaderDocumentExtractionStatus
  | "MISSING_ENVELOPE";

/** Model or trusted classification for a source document. */
export type CanonicalStudyDocumentClassificationStatus =
  | "classified"
  | "unknown"
  | "ambiguous"
  | "unclassified";

export type CanonicalStudyFoundationEvidence = {
  sourceDocumentId: string;
  page: number;
  quote: string;
  spanStart?: number;
  spanEnd?: number;
  wordStartIndex?: number;
  wordEndIndex?: number;
};

export type CanonicalStudyFoundationEnvelopeRef = {
  studyRunId: string;
  attemptId: string;
  sourceDocumentId: string;
  envelopeStatus: string;
};

export type CanonicalStudyFoundationFieldDisposition = "verified" | "rejected" | "unresolved";

export type CanonicalStudyFoundationNormalizedValue = {
  valueKind: string;
  displayValue: unknown;
  normalizedValue: unknown;
  unit?: string | null;
};

export type CanonicalStudyFoundationProposedField = {
  fieldKey: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
  documentTypeId: string | null;
  valueKind: string;
  provenance: string;
  modality: string;
  missingState: string | null;
  displayValue: unknown;
  evidence: CanonicalStudyFoundationEvidence | null;
  envelopeRef: CanonicalStudyFoundationEnvelopeRef;
  parseErrors: string[];
};

export type CanonicalStudyFoundationGroupedRecord = {
  recordGroupId: string;
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldKeys: string[];
};

export type CanonicalStudyFoundationVerifiedField = CanonicalStudyFoundationProposedField & {
  disposition: "verified";
  verifiedEvidence: CanonicalStudyFoundationEvidence[];
  normalized: CanonicalStudyFoundationNormalizedValue;
  reasons: [];
};

export type CanonicalStudyFoundationRejectedField = CanonicalStudyFoundationProposedField & {
  disposition: "rejected";
  reasons: string[];
};

export type CanonicalStudyFoundationUnresolvedField = CanonicalStudyFoundationProposedField & {
  disposition: "unresolved";
  reasons: string[];
};

export type CanonicalStudyFoundationFieldOutcome =
  | CanonicalStudyFoundationVerifiedField
  | CanonicalStudyFoundationRejectedField
  | CanonicalStudyFoundationUnresolvedField;

export type CanonicalStudyFoundationDocumentOrder = {
  sourceDocumentId: string;
  documentTypeId: string | null;
  authorRoleId: string | null;
  party: string | null;
  verifiedOrderingDate: string | null;
  orderingDateFieldPath: string | null;
  sortRank: number;
  extractionStatus: CanonicalStudyDocumentExtractionStatus;
  classificationStatus: CanonicalStudyDocumentClassificationStatus;
  trustedPagesSupplied: boolean;
  matchedPageTerms: string[];
  amendsDocumentTypeId: string | null;
  amendmentLinkStatus: "linked" | "unresolved" | "not_applicable";
  amendmentTargetSourceDocumentId: string | null;
};

export type CanonicalStudyFoundationUnresolvedItem = {
  id: string;
  kind:
    | "extraction_unavailable"
    | "parse_failure"
    | "missing_ordering_date"
    | "amendment_link_unresolved"
    | "unsupported_derivation"
    | "derived_operand_unverified"
    | "orphan_record";
  message: string;
  sourceDocumentId?: string;
  fieldKey?: string;
  recordGroupId?: string;
};

export type CanonicalStudyFoundationCounts = {
  proposed: number;
  verified: number;
  rejected: number;
  unresolved: number;
};

export type CanonicalStudyFoundationArtifactBody = {
  schemaVersion: typeof CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  packContentSha256: string;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  counts: CanonicalStudyFoundationCounts;
  documents: CanonicalStudyFoundationDocumentOrder[];
  groupedRecords: CanonicalStudyFoundationGroupedRecord[];
  verifiedFields: CanonicalStudyFoundationVerifiedField[];
  rejectedFields: CanonicalStudyFoundationRejectedField[];
  unresolvedFields: CanonicalStudyFoundationUnresolvedField[];
  unresolvedItems: CanonicalStudyFoundationUnresolvedItem[];
};

export type CanonicalStudyFoundationArtifact = CanonicalStudyFoundationArtifactBody & {
  createdAt: string;
  contentSha256: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseCanonicalStudyFoundationArtifact(raw: unknown): CanonicalStudyFoundationArtifact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== CANONICAL_STUDY_FOUNDATION_SCHEMA_VERSION) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: schemaVersion");
  }
  if (!isNonEmptyString(record.packId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packId");
  }
  if (!isNonEmptyString(record.packVersion)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packVersion");
  }
  if (!isNonEmptyString(record.packContentSha256)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: packContentSha256");
  }
  if (!isNonEmptyString(record.studyRunId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: studyRunId");
  }
  if (!isNonEmptyString(record.attemptId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: attemptId");
  }
  if (!isNonEmptyString(record.caseId)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: caseId");
  }
  if (!isNonEmptyString(record.createdAt)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: createdAt");
  }
  if (!isNonEmptyString(record.contentSha256)) {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: contentSha256");
  }
  const counts = record.counts;
  if (!counts || typeof counts !== "object") {
    throw new Error("CANONICAL_STUDY_FOUNDATION_INVALID: counts");
  }
  return raw as CanonicalStudyFoundationArtifact;
}
```

## `engine/shared/src/reader-document-extraction.ts`

```typescript
export const READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION = "hive.reader-document-extraction/1" as const;
export const READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION =
  "hive.reader-document-extraction-manifest/1" as const;

export type ReaderDocumentExtractionStatus = "SUCCEEDED" | "INVALID_JSON" | "MODEL_ERROR";

export type ReaderDocumentExtractionEnvelope = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  userId: string;
  sourceDocumentId: string;
  domainId: string;
  packId: string;
  packVersion: string;
  packContentSha256: string | null;
  promptVersion: string | null;
  modelProvider: string;
  modelId: string;
  status: ReaderDocumentExtractionStatus;
  occurredAt: string;
  rawAssistantText?: string;
  parsedModelJson?: Record<string, unknown>;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadInputTokens: number | null;
    cacheWriteInputTokens: number | null;
  };
  latencyMs?: number;
  sanitizedError?: {
    code: string;
    message: string;
  };
};

export type ReaderDocumentExtractionAttemptManifest = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  attemptId: string;
  caseId: string;
  updatedAt: string;
  documents: Array<{
    sourceDocumentId: string;
    status: ReaderDocumentExtractionStatus;
    envelopeObjectKey: string;
  }>;
};

export type ReaderDocumentExtractionStudyRunManifest = {
  schemaVersion: typeof READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  caseId: string;
  latestAttemptId: string;
  updatedAt: string;
  latestAttemptManifestObjectKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (!isNonEmptyString(value)) {
    throw new Error(`READER_DOCUMENT_EXTRACTION_INVALID: ${field}`);
  }
  return value;
}

function parseUsage(raw: unknown): ReaderDocumentExtractionEnvelope["usage"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const readToken = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  };
  return {
    inputTokens: readToken("inputTokens", "input_tokens"),
    outputTokens: readToken("outputTokens", "output_tokens"),
    cacheReadInputTokens: readToken("cacheReadInputTokens", "cache_read_input_tokens"),
    cacheWriteInputTokens: readToken("cacheWriteInputTokens", "cache_write_input_tokens"),
  };
}

export function parseReaderDocumentExtractionEnvelope(raw: unknown): ReaderDocumentExtractionEnvelope {
  if (!raw || typeof raw !== "object") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: expected object");
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION) {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: schemaVersion");
  }
  const status = record.status;
  if (status !== "SUCCEEDED" && status !== "INVALID_JSON" && status !== "MODEL_ERROR") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: status");
  }
  const studyRunId = readRequiredString(record, "studyRunId");
  const attemptId = readRequiredString(record, "attemptId");
  const caseId = readRequiredString(record, "caseId");
  const userId = readRequiredString(record, "userId");
  const sourceDocumentId = readRequiredString(record, "sourceDocumentId");
  const domainId = readRequiredString(record, "domainId");
  const packId = readRequiredString(record, "packId");
  const packVersion = readRequiredString(record, "packVersion");
  const modelProvider = readRequiredString(record, "modelProvider");
  const modelId = readRequiredString(record, "modelId");
  const occurredAt = readRequiredString(record, "occurredAt");
  const packHash = record.packContentSha256;
  if (packHash !== null && packHash !== undefined) {
    if (typeof packHash !== "string" || !/^[a-f0-9]{64}$/.test(packHash)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: packContentSha256");
    }
  }
  const promptVersion = record.promptVersion;
  if (promptVersion !== null && promptVersion !== undefined && !isNonEmptyString(promptVersion)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: promptVersion");
  }
  let parsedModelJson: Record<string, unknown> | undefined;
  if (record.parsedModelJson !== undefined && record.parsedModelJson !== null) {
    if (!record.parsedModelJson || typeof record.parsedModelJson !== "object" || Array.isArray(record.parsedModelJson)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: parsedModelJson");
    }
    parsedModelJson = record.parsedModelJson as Record<string, unknown>;
  }
  let sanitizedError: ReaderDocumentExtractionEnvelope["sanitizedError"];
  if (record.sanitizedError !== undefined && record.sanitizedError !== null) {
    if (!record.sanitizedError || typeof record.sanitizedError !== "object") {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: sanitizedError");
    }
    const err = record.sanitizedError as Record<string, unknown>;
    if (!isNonEmptyString(err.code) || !isNonEmptyString(err.message)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: sanitizedError fields");
    }
    sanitizedError = { code: err.code, message: err.message };
  }
  const latencyMs = record.latencyMs;
  if (latencyMs !== undefined && latencyMs !== null) {
    if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: latencyMs");
    }
  }
  const rawAssistantText = record.rawAssistantText;
  if (rawAssistantText !== undefined && rawAssistantText !== null && typeof rawAssistantText !== "string") {
    throw new Error("READER_DOCUMENT_EXTRACTION_INVALID: rawAssistantText");
  }
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId,
    attemptId,
    caseId,
    userId,
    sourceDocumentId,
    domainId,
    packId,
    packVersion,
    packContentSha256: (packHash as string | null | undefined) ?? null,
    promptVersion: (promptVersion as string | null | undefined) ?? null,
    modelProvider,
    modelId,
    status,
    occurredAt,
    rawAssistantText: rawAssistantText as string | undefined,
    parsedModelJson,
    usage: parseUsage(record.usage),
    latencyMs: latencyMs as number | undefined,
    sanitizedError,
  };
}

export function buildReaderDocumentExtractionEnvelope(
  input: ReaderDocumentExtractionEnvelope,
): ReaderDocumentExtractionEnvelope {
  return parseReaderDocumentExtractionEnvelope(input);
}

export function buildReaderDocumentExtractionAttemptManifest(input: {
  studyRunId: string;
  attemptId: string;
  caseId: string;
  updatedAt: string;
  documents: ReaderDocumentExtractionAttemptManifest["documents"];
}): ReaderDocumentExtractionAttemptManifest {
  if (!isNonEmptyString(input.studyRunId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: studyRunId");
  }
  if (!isNonEmptyString(input.attemptId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: attemptId");
  }
  if (!isNonEmptyString(input.caseId)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: caseId");
  }
  if (!isNonEmptyString(input.updatedAt)) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: updatedAt");
  }
  if (!Array.isArray(input.documents) || input.documents.length === 0) {
    throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: documents");
  }
  for (const doc of input.documents) {
    if (!isNonEmptyString(doc.sourceDocumentId)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: sourceDocumentId");
    }
    if (doc.status !== "SUCCEEDED" && doc.status !== "INVALID_JSON" && doc.status !== "MODEL_ERROR") {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: status");
    }
    if (!isNonEmptyString(doc.envelopeObjectKey)) {
      throw new Error("READER_DOCUMENT_EXTRACTION_MANIFEST_INVALID: envelopeObjectKey");
    }
  }
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_MANIFEST_SCHEMA_VERSION,
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    caseId: input.caseId,
    updatedAt: input.updatedAt,
    documents: input.documents,
  };
}
```

