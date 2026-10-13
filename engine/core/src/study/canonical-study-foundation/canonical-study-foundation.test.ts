import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";
import type { ReaderDocumentExtractionEnvelope } from "@hiveforyou/shared/reader-document-extraction";
import type { CanonicalStudyProvenanceChip } from "@hiveforyou/shared/canonical-study-artifact";
import { describe, expect, it } from "vitest";

import { normalizedFieldValue } from "../canonical-study/construct-keys.js";
import type { IndexedRecordVersion } from "../canonical-study/indexed-foundation.js";
import type { DocumentPages } from "../../document/page-model.js";
import {
  buildCanonicalStudyFoundation,
  groupRecordsWithinDocuments,
  hashCanonicalStudyFoundationBody,
  normalizeVerifiedField,
  tryDerivedPrimitive,
  verifyProposedField,
} from "./index.js";
import { flattenProposedFields } from "./flatten-proposed-fields.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../../..");

const TEST_PACK: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "test", version: "0.0.1" },
  documentTypes: [
    {
      id: "iep.plan",
      authorRole: "education_agency",
      orderingDate: "document_header.effective_start",
      checklist: ["document_header", "goal"],
    },
    {
      id: "iep.amendment",
      authorRole: "education_agency",
      orderingDate: "amendment_change.effective_date",
      amends: "iep.plan",
      documentLinks: ["amends"],
      checklist: ["document_header", "amendment_change"],
    },
  ],
  authorRoles: [
    { id: "education_agency", party: "school" },
    { id: "parent_guardian", party: "parent" },
  ],
  recordTypes: [
    {
      id: "document_header",
      repeatable: false,
      fields: [
        { id: "effective_start", valueKind: "date", source: ["quoted"], modality: ["observed"] },
        { id: "document_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
    {
      id: "goal",
      repeatable: true,
      fields: [
        { id: "statement", valueKind: "text", source: ["quoted"], modality: ["planned"] },
      ],
    },
    {
      id: "amendment_change",
      repeatable: true,
      fields: [
        { id: "effective_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
        { id: "target_plan_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
    {
      id: "service",
      repeatable: true,
      fields: [
        { id: "frequency_text", valueKind: "text", source: ["quoted"], modality: ["planned"] },
        {
          id: "minutes_per_session",
          valueKind: "quantity",
          source: ["quoted"],
          modality: ["planned"],
          unit: "minutes",
        },
        {
          id: "sessions_per_period",
          valueKind: "quantity",
          source: ["derived"],
          modality: ["planned"],
          derivation: { primitive: "parseFrequency", operands: ["frequency_text"] },
        },
        {
          id: "period",
          valueKind: "code",
          source: ["classified"],
          modality: ["planned"],
          enum: ["day", "week", "month", "year"],
        },
        {
          id: "minutes_per_week",
          valueKind: "quantity",
          source: ["derived"],
          modality: ["planned"],
          unit: "min/week",
          derivation: {
            primitive: "ratePerWeek",
            operands: ["minutes_per_session", "sessions_per_period", "period"],
          },
        },
      ],
    },
  ],
  readingNotes: { global: "", byDocumentType: {} },
  vocabulary: {
    unitAliases: [{ canonical: "minutes", aliases: ["min", "mins"] }],
  },
};

function envelope(input: {
  sourceDocumentId: string;
  parsedModelJson: Record<string, unknown>;
  status?: ReaderDocumentExtractionEnvelope["status"];
}): ReaderDocumentExtractionEnvelope {
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId: "study-test",
    attemptId: "attempt-test",
    caseId: "case-test",
    userId: "user-test",
    sourceDocumentId: input.sourceDocumentId,
    domainId: "iep",
    packId: "test",
    packVersion: "0.0.1",
    packContentSha256: "b".repeat(64),
    promptVersion: "hive-pack-driven-reader/0.2.0",
    modelProvider: "fixture",
    modelId: "fixture",
    status: input.status ?? "SUCCEEDED",
    occurredAt: "2026-10-12T12:00:00Z",
    parsedModelJson: input.parsedModelJson,
  };
}

function mockDocumentPages(sourceDocumentId: string, pageNumber: number, quote: string): DocumentPages {
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
    sha256: "a".repeat(64),
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

function loadL001DocumentPages(filename: string, sourceDocumentId: string): DocumentPages {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "packages/intake/fixtures/l001/document-pages", filename), "utf8"),
  ) as { documentPages: DocumentPages };
  return {
    ...raw.documentPages,
    documentId: sourceDocumentId,
  };
}

describe("canonical-study-foundation", () => {
  it("groups records within a document only (one group per instance)", () => {
    const flattened = flattenProposedFields({
      pack: TEST_PACK,
      envelopes: [
        envelope({
          sourceDocumentId: "doc-a",
          parsedModelJson: {
            sourceDocumentId: "doc-a",
            documentTypeId: "iep.plan",
            recordInstances: [
              {
                recordTypeId: "goal",
                instanceIndex: 0,
                fields: [
                  {
                    fieldId: "statement",
                    provenance: "quoted",
                    valueKind: "text",
                    value: "Read fluently",
                    modality: "planned",
                    missingState: null,
                    evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Read fluently" },
                  },
                ],
              },
              {
                recordTypeId: "goal",
                instanceIndex: 1,
                fields: [
                  {
                    fieldId: "statement",
                    provenance: "quoted",
                    valueKind: "text",
                    value: "Write clearly",
                    modality: "planned",
                    missingState: null,
                    evidence: { sourceDocumentId: "doc-a", page: 1, quote: "Write clearly" },
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    const groups = groupRecordsWithinDocuments(flattened.proposedFields);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.instanceIndex).toBe(0);
    expect(groups[1]?.instanceIndex).toBe(1);
    expect(groups.every((group) => group.sourceDocumentId === "doc-a")).toBe(true);
  });

  it("accounts for every proposed field as verified, rejected, or unresolved", () => {
    const artifact = buildCanonicalStudyFoundation({
      pack: TEST_PACK,
      packContentSha256: "a".repeat(64),
      caseId: "case-test",
      createdAt: "2026-10-12T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "doc-a",
          documentPages: null,
          envelope: envelope({
            sourceDocumentId: "doc-a",
            parsedModelJson: {
              sourceDocumentId: "doc-a",
              documentTypeId: "iep.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [
                    {
                      fieldId: "effective_start",
                      provenance: "quoted",
                      valueKind: "date",
                      value: "2024-11-12",
                      modality: "observed",
                      missingState: null,
                      evidence: { sourceDocumentId: "doc-a", page: 1, quote: "2024-11-12" },
                    },
                    {
                      fieldId: "document_date",
                      provenance: "quoted",
                      valueKind: "date",
                      value: "2099-01-01",
                      modality: "observed",
                      missingState: null,
                      evidence: { sourceDocumentId: "doc-a", page: 1, quote: "2024-11-12" },
                    },
                  ],
                },
                {
                  recordTypeId: "goal",
                  instanceIndex: 0,
                  fields: [
                    {
                      fieldId: "statement",
                      provenance: "quoted",
                      valueKind: "text",
                      value: null,
                      modality: "planned",
                      missingState: "not_found_in_supplied_documents",
                      evidence: null,
                    },
                  ],
                },
              ],
            },
          }),
        },
      ],
    });

    expect(artifact.counts.proposed).toBe(3);
    expect(
      artifact.counts.verified + artifact.counts.rejected + artifact.counts.unresolved,
    ).toBe(artifact.counts.proposed);
    expect(artifact.rejectedFields.some((field) => field.fieldId === "document_date")).toBe(true);
    expect(artifact.unresolvedFields.some((field) => field.fieldId === "statement")).toBe(true);
  });

  it("verifies quote against L001 document-pages with synthetic extraction payload (not L001 qualification)", () => {
    const sourceDocumentId = "00000000-0000-4000-8000-000000000008";
    const pages = loadL001DocumentPages("08_initial_iep.json", sourceDocumentId);
    const flattened = flattenProposedFields({
      pack: TEST_PACK,
      envelopes: [
        envelope({
          sourceDocumentId,
          parsedModelJson: {
            sourceDocumentId,
            documentTypeId: "iep.plan",
            recordInstances: [
              {
                recordTypeId: "document_header",
                instanceIndex: 0,
                fields: [
                  {
                    fieldId: "effective_start",
                    provenance: "quoted",
                    valueKind: "date",
                    value: "2024-11-12",
                    modality: "observed",
                    missingState: null,
                    evidence: {
                      sourceDocumentId,
                      page: 1,
                      quote: "2024-11-12",
                    },
                  },
                ],
              },
            ],
          },
        }),
      ],
    });

    const field = flattened.proposedFields[0]!;
    const result = verifyProposedField({ field, pack: TEST_PACK, documentPages: pages });
    expect(result.status).toBe("verified");
  });

  it("sorts documents with missing verified ordering dates last", () => {
    const artifact = buildCanonicalStudyFoundation({
      pack: TEST_PACK,
      packContentSha256: "c".repeat(64),
      caseId: "case-test",
      createdAt: "2026-10-12T00:00:00.000Z",
      documents: [
        {
          sourceDocumentId: "doc-no-date",
          documentPages: null,
          envelope: envelope({
            sourceDocumentId: "doc-no-date",
            parsedModelJson: {
              sourceDocumentId: "doc-no-date",
              documentTypeId: "iep.plan",
              recordInstances: [],
            },
          }),
        },
        {
          sourceDocumentId: "doc-with-date",
          documentPages: mockDocumentPages("doc-with-date", 1, "2023-01-01"),
          envelope: envelope({
            sourceDocumentId: "doc-with-date",
            parsedModelJson: {
              sourceDocumentId: "doc-with-date",
              documentTypeId: "iep.plan",
              recordInstances: [
                {
                  recordTypeId: "document_header",
                  instanceIndex: 0,
                  fields: [
                    {
                      fieldId: "effective_start",
                      provenance: "quoted",
                      valueKind: "date",
                      value: "2023-01-01",
                      modality: "observed",
                      missingState: null,
                      evidence: {
                        sourceDocumentId: "doc-with-date",
                        page: 1,
                        quote: "2023-01-01",
                      },
                    },
                  ],
                },
              ],
            },
          }),
        },
      ],
    });

    expect(artifact.documents[0]?.sourceDocumentId).toBe("doc-with-date");
    expect(artifact.documents[1]?.sourceDocumentId).toBe("doc-no-date");
    expect(artifact.documents[1]?.verifiedOrderingDate).toBeNull();
    expect(
      artifact.unresolvedItems.some((item) => item.kind === "missing_ordering_date"),
    ).toBe(true);
  });

  it("normalizes dates to ISO and preserves display values", () => {
    const field = {
      fieldKey: "doc-a|document_header|0|effective_start",
      sourceDocumentId: "doc-a",
      recordTypeId: "document_header",
      instanceIndex: 0,
      fieldId: "effective_start",
      documentTypeId: "iep.plan",
      valueKind: "date",
      provenance: "quoted",
      modality: "observed",
      missingState: null,
      displayValue: "11/12/2024",
      evidence: null,
      envelopeRef: {
        studyRunId: "study-test",
        attemptId: "attempt-test",
        sourceDocumentId: "doc-a",
        envelopeStatus: "SUCCEEDED",
      },
      parseErrors: [],
    };
    const normalized = normalizeVerifiedField({ field, pack: TEST_PACK });
    expect(normalized.displayValue).toBe("11/12/2024");
    expect(normalized.normalizedValue).toBe("2024-11-12");
  });

  it("leaves unsupported derivations unresolved", () => {
    const result = tryDerivedPrimitive("unknownPrimitive", { frequency_text: "5 times per week" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("unsupported derivation primitive");
    }
  });

  it("produces deterministic contentSha256 excluding createdAt", () => {
    const documents = [
      {
        sourceDocumentId: "doc-a",
        documentPages: null,
        envelope: envelope({
          sourceDocumentId: "doc-a",
          parsedModelJson: {
            sourceDocumentId: "doc-a",
            documentTypeId: "iep.plan",
            recordInstances: [],
          },
        }),
      },
    ];

    const first = buildCanonicalStudyFoundation({
      pack: TEST_PACK,
      packContentSha256: "f".repeat(64),
      caseId: "case-test",
      createdAt: "2026-10-12T00:00:00.000Z",
      documents,
    });
    const second = buildCanonicalStudyFoundation({
      pack: TEST_PACK,
      packContentSha256: "f".repeat(64),
      caseId: "case-test",
      createdAt: "2026-10-13T00:00:00.000Z",
      documents,
    });

    expect(first.contentSha256).toBe(second.contentSha256);
    const {
      createdAt: _createdAtA,
      contentSha256: _hashA,
      ...bodyA
    } = first;
    expect(hashCanonicalStudyFoundationBody(bodyA)).toBe(first.contentSha256);
  });

  it("does not mutate raw envelope objects", () => {
    const env = envelope({
      sourceDocumentId: "doc-a",
      parsedModelJson: {
        sourceDocumentId: "doc-a",
        documentTypeId: "iep.plan",
        recordInstances: [],
      },
    });
    Object.freeze(env);
    Object.freeze(env.parsedModelJson!);

    expect(() =>
      buildCanonicalStudyFoundation({
        pack: TEST_PACK,
        packContentSha256: "g".repeat(64),
        caseId: "case-test",
        documents: [{ sourceDocumentId: "doc-a", documentPages: null, envelope: env }],
      }),
    ).not.toThrow();
  });

  it("applies IEP pack fieldSynonyms terms during construct normalization", () => {
    const iepPack = JSON.parse(
      readFileSync(join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json"), "utf8"),
    ) as ProposalDomainPack;
    const chip: CanonicalStudyProvenanceChip = {
      fieldKey: "doc-a|measurement|0|measure.score_type",
      recordGroupId: "group-a",
      sourceDocumentId: "doc-a",
      recordTypeId: "measurement",
      instanceIndex: 0,
      fieldId: "measure.score_type",
      evidence: [],
      normalized: {
        valueKind: "code",
        displayValue: "WCPM",
        normalizedValue: "WCPM",
      },
      envelopeRef: {
        studyRunId: "study-test",
        attemptId: "attempt-test",
        sourceDocumentId: "doc-a",
        envelopeStatus: "SUCCEEDED",
      },
    };
    const record: IndexedRecordVersion = {
      recordGroupId: "group-a",
      sourceDocumentId: "doc-a",
      recordTypeId: "measurement",
      instanceIndex: 0,
      documentTypeId: "iep.evaluation.academic",
      orderingDate: "2024-01-01",
      sortRank: 0,
      party: "school",
      fieldKeys: ["measure.score_type"],
      provenanceByFieldKey: { "measure.score_type": chip },
    };

    expect(() =>
      normalizedFieldValue(record, "measure.score_type", iepPack, "measure"),
    ).not.toThrow();
    expect(normalizedFieldValue(record, "measure.score_type", iepPack, "measure")).toBe(
      "words_correct_per_minute",
    );
  });
});
