import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";

import type { DocumentPages } from "../../document/page-model.js";
import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";

export const SYNTHETIC_PACK: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "synthetic-test", version: "0.0.1" },
  relationshipRules: {
    changeRequiresTemporalSuccession: true,
    temporalSuccessionFieldIds: ["effective_date", "observed_on"],
    conflictWhenDifferentParties: true,
  },
  compositionRules: [
    {
      id: "plan_amendment",
      amendmentDocumentTypeId: "doc.amendment",
      baseDocumentTypeId: "doc.plan",
      changeRecordTypeId: "amendment_change",
      affectedRecordTypeFieldId: "affected_record_type",
      overlayMode: "replace_by_content_key",
    },
  ],
  requirements: {
    rules: [
      {
        id: "goal_required",
        appliesTo: "operative:doc.plan",
        checks: [{ record: "goal", fields: ["statement"], minCount: 1 }],
      },
      {
        id: "conditional_service",
        appliesTo: "operative:doc.plan",
        when: { primitive: "exists", record: "service", field: "category", equals: "speech" },
        checks: [{ record: "service", fields: ["minutes_per_week"] }],
      },
    ],
  },
  insightChecks: {
    enginePrimitivesRequired: ["compareValues", "exists", "coChange", "absenceOf"],
    checks: [
      {
        id: "value_compare",
        primitive: "compareValues",
        left: { record: "goal", field: "statement" },
        right: { record: "goal", field: "statement" },
        fires: "values_differ_with_compatible_units",
        question: "Left {left} right {right}?",
      },
      {
        id: "partial_check",
        primitive: "coChange",
        question: "Should not fire?",
      },
    ],
  },
  documentTypes: [
    {
      id: "doc.plan",
      authorRole: "party_a",
      orderingDate: "document_header.effective_date",
      checklist: ["document_header", "student", "goal", "service"],
    },
    {
      id: "doc.amendment",
      authorRole: "party_a",
      orderingDate: "amendment_change.effective_date",
      amends: "doc.plan",
      checklist: ["amendment_change", "goal"],
    },
    {
      id: "doc.notice",
      authorRole: "party_b",
      orderingDate: "document_header.effective_date",
      checklist: ["document_header", "goal"],
    },
  ],
  authorRoles: [
    { id: "party_a", party: "alpha" },
    { id: "party_b", party: "beta" },
  ],
  recordTypes: [
    {
      id: "document_header",
      repeatable: false,
      identity: {
        scope: "document",
        keyFields: [],
        caseSingletonMerge: "never_auto_merge",
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "effective_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
    {
      id: "student",
      repeatable: false,
      identity: {
        scope: "case",
        keyFields: [],
        caseSingletonMerge: "guaranteed_unique",
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "name", valueKind: "text", source: ["quoted"], modality: ["observed"] },
        { id: "birth_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
    {
      id: "goal",
      repeatable: true,
      identity: {
        scope: "case",
        keyFields: ["area"],
        keyFieldsIfPresent: ["condition"],
        disambiguators: ["statement"],
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "area", valueKind: "text", source: ["quoted"], modality: ["planned"] },
        { id: "condition", valueKind: "text", source: ["quoted"], modality: ["planned"] },
        { id: "statement", valueKind: "text", source: ["quoted"], modality: ["planned"] },
        { id: "effective_date", valueKind: "date", source: ["quoted"], modality: ["planned"] },
      ],
    },
    {
      id: "service",
      repeatable: true,
      identity: {
        scope: "case",
        keyFields: ["category"],
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "category", valueKind: "text", source: ["quoted"], modality: ["planned"] },
        { id: "minutes_per_week", valueKind: "quantity", source: ["quoted"], modality: ["planned"] },
      ],
    },
    {
      id: "amendment_change",
      repeatable: true,
      composition: {
        role: "amendment_change",
        overlayMode: "replace_by_content_key",
        affectedRecordTypeFieldId: "affected_record_type",
      },
      identity: {
        scope: "case",
        keyFields: ["affected_record_type"],
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "affected_record_type", valueKind: "text", source: ["quoted"], modality: ["observed"] },
        { id: "effective_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
  ],
  readingNotes: { global: "", byDocumentType: {} },
};

export function envelope(input: {
  sourceDocumentId: string;
  parsedModelJson?: Record<string, unknown>;
  status?: ReaderDocumentExtractionEnvelope["status"];
  sanitizedError?: ReaderDocumentExtractionEnvelope["sanitizedError"];
}): ReaderDocumentExtractionEnvelope {
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId: "study-test",
    attemptId: "attempt-test",
    caseId: "case-test",
    userId: "user-test",
    sourceDocumentId: input.sourceDocumentId,
    domainId: "synthetic",
    packId: "synthetic-test",
    packVersion: "0.0.1",
    packContentSha256: "a".repeat(64),
    promptVersion: "hive-pack-driven-reader/0.2.0",
    modelProvider: "fixture",
    modelId: "fixture",
    status: input.status ?? "SUCCEEDED",
    occurredAt: "2026-10-12T12:00:00Z",
    parsedModelJson: input.parsedModelJson,
    sanitizedError: input.sanitizedError,
  };
}

export function mockPages(sourceDocumentId: string, pageNumber: number, quote: string): DocumentPages {
  const words = quote.split(/\s+/).map((text, seq) => ({
    seq,
    text,
    bbox: [0, 0, 1, 1] as [number, number, number, number],
    confidence: null,
    fontName: null,
    fontSize: null,
    bold: null,
    italic: null,
    source: "native" as const,
  }));
  return {
    documentId: sourceDocumentId,
    sha256: "b".repeat(64),
    formFields: [],
    pages: [
      {
        documentId: sourceDocumentId,
        pageNumber,
        words,
        width: 612,
        height: 792,
        rotation: 0,
        route: "native",
        imageRef: null,
        quality: {
          garbageRatio: 0,
          illegibleRegions: [],
          meanConfidence: null,
          textCoverage: null,
        },
      },
    ],
  };
}

export function fieldQuote(
  fieldId: string,
  valueKind: string,
  value: unknown,
  sourceDocumentId: string,
  page: number,
  quote: string,
) {
  return {
    fieldId,
    provenance: "quoted",
    valueKind,
    value,
    modality: "planned",
    missingState: null,
    evidence: { sourceDocumentId, page, quote },
  };
}

export function planGoalDoc(
  sourceDocumentId: string,
  documentTypeId: string,
  statement: string,
  effectiveDate: string,
  includeGoalEffective = true,
) {
  const goalFields = [
    fieldQuote("area", "text", "reading", sourceDocumentId, 1, "reading"),
    fieldQuote("statement", "text", statement, sourceDocumentId, 1, statement),
  ];
  if (includeGoalEffective) {
    goalFields.push(
      fieldQuote("effective_date", "date", effectiveDate, sourceDocumentId, 1, effectiveDate),
    );
  }
  return {
    sourceDocumentId,
    documentTypeId,
    recordInstances: [
      {
        recordTypeId: "document_header",
        instanceIndex: 0,
        fields: [
          fieldQuote("effective_date", "date", effectiveDate, sourceDocumentId, 1, effectiveDate),
        ],
      },
      {
        recordTypeId: "goal",
        instanceIndex: 0,
        fields: goalFields,
      },
    ],
  };
}

export function docWithStudent(sourceDocumentId: string, name: string, birthDate: string) {
  return {
    sourceDocumentId,
    pages: mockPages(sourceDocumentId, 1, `${name} ${birthDate}`),
    parsedModelJson: {
      sourceDocumentId,
      documentTypeId: "doc.plan",
      recordInstances: [
        {
          recordTypeId: "document_header",
          instanceIndex: 0,
          fields: [
            fieldQuote("effective_date", "date", "2024-01-01", sourceDocumentId, 1, "2024-01-01"),
          ],
        },
        {
          recordTypeId: "student",
          instanceIndex: 0,
          fields: [
            fieldQuote("name", "text", name, sourceDocumentId, 1, name),
            fieldQuote("birth_date", "date", birthDate, sourceDocumentId, 1, birthDate),
          ],
        },
      ],
    },
  };
}

export function buildSyntheticFoundation(input: {
  documents: Array<{
    sourceDocumentId: string;
    parsedModelJson?: Record<string, unknown>;
    pages?: DocumentPages | null;
    status?: ReaderDocumentExtractionEnvelope["status"];
    sanitizedError?: ReaderDocumentExtractionEnvelope["sanitizedError"];
    extractionStatusOverride?: "MISSING_ENVELOPE";
  }>;
  packContentSha256?: string;
}) {
  return buildCanonicalStudyFoundation({
    pack: SYNTHETIC_PACK,
    packContentSha256: input.packContentSha256 ?? "a".repeat(64),
    caseId: "case-test",
    createdAt: "2026-10-12T00:00:00.000Z",
    documents: input.documents.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      envelope: envelope({
        sourceDocumentId: doc.sourceDocumentId,
        parsedModelJson: doc.parsedModelJson,
        status: doc.status,
        sanitizedError: doc.sanitizedError,
      }),
      documentPages: doc.pages ?? null,
      extractionStatusOverride: doc.extractionStatusOverride,
    })),
  });
}
