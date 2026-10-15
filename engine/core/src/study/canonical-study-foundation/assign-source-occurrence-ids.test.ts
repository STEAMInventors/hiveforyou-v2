import { describe, expect, it } from "vitest";

import type { DocumentPages, PageWord } from "../../document/page-model.js";
import type {
  CanonicalStudyFoundationFieldOutcome,
  CanonicalStudyFoundationGroupedRecord,
} from "@hiveforyou/shared/canonical-study-foundation";

import { assignSourceOccurrenceIds } from "./assign-source-occurrence-ids.js";
import { buildRecordGroupId } from "./field-key.js";
import { verifyProposedField } from "./verify-proposed-field.js";
import { buildCanonicalStudyFoundation } from "./build-artifact.js";
import { SYNTHETIC_PACK, mockPages } from "../canonical-study/test-fixtures.js";

function word(text: string, seq: number): PageWord {
  return {
    seq,
    text,
    bbox: [0, 0, 1, 1],
    confidence: null,
    fontName: null,
    fontSize: null,
    bold: null,
    italic: null,
    source: "native",
  };
}

function mockPagesWithTwoQuotes(
  sourceDocumentId: string,
  quote: string,
): DocumentPages {
  const words: PageWord[] = [];
  let seq = 0;
  for (const token of "before alpha beta gamma after".split(" ")) {
    words.push(word(token, seq++));
  }
  const quoteTokens = quote.split(" ");
  for (const token of quoteTokens) {
    words.push(word(token, seq++));
  }
  for (const token of "tail end".split(" ")) {
    words.push(word(token, seq++));
  }
  return {
    documentId: sourceDocumentId,
    pages: [{ pageNumber: 1, words, width: 100, height: 100 }],
  };
}

function proposedField(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
  quote: string;
  displayValue: string;
}): CanonicalStudyFoundationFieldOutcome {
  const fieldKey = `${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}|${input.fieldId}`;
  const base = {
    fieldKey,
    sourceDocumentId: input.sourceDocumentId,
    recordTypeId: input.recordTypeId,
    instanceIndex: input.instanceIndex,
    fieldId: input.fieldId,
    documentTypeId: "doc.plan",
    valueKind: "text",
    provenance: "quoted",
    modality: "planned",
    missingState: null,
    displayValue: input.displayValue,
    evidence: {
      sourceDocumentId: input.sourceDocumentId,
      page: 1,
      quote: input.quote,
    },
    envelopeRef: {
      studyRunId: "run",
      attemptId: "attempt",
      sourceDocumentId: input.sourceDocumentId,
      envelopeStatus: "SUCCEEDED",
    },
    parseErrors: [],
  };
  return { ...base, disposition: "unresolved", reasons: ["pending"] };
}

function groupFor(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
}): CanonicalStudyFoundationGroupedRecord {
  const recordGroupId = buildRecordGroupId(input);
  return {
    recordGroupId,
    ...input,
    fieldKeys: [`${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}|statement`],
  };
}

describe("assignSourceOccurrenceIds", () => {
  it("flags indistinguishable duplicate anchors as unstable occurrence identity", () => {
    const quote = "alpha beta gamma";
    const pages = mockPagesWithTwoQuotes("doc-a", quote);
    const verifyInstance = (instanceIndex: number) => {
      const proposed = proposedField({
        sourceDocumentId: "doc-a",
        recordTypeId: "goal",
        instanceIndex,
        fieldId: "statement",
        quote,
        displayValue: quote,
      });
      const verified = verifyProposedField({
        field: { ...proposed, disposition: "verified" as const, reasons: [] },
        pack: SYNTHETIC_PACK,
        documentPages: pages,
      });
      expect(verified.status).toBe("verified");
      return {
        group: groupFor({ sourceDocumentId: "doc-a", recordTypeId: "goal", instanceIndex }),
        field: {
          ...proposed,
          disposition: "verified" as const,
          verifiedEvidence: verified.status === "verified" ? verified.verifiedEvidence : [],
          normalized: {
            valueKind: "text",
            displayValue: quote,
            normalizedValue: quote,
          },
          reasons: [] as [],
        },
      };
    };

    const first = verifyInstance(0);
    const second = verifyInstance(1);
    const assigned = assignSourceOccurrenceIds({
      pack: SYNTHETIC_PACK,
      groupedRecords: [first.group, second.group],
      fieldOutcomes: [first.field, second.field],
    });
    expect(assigned.groupedRecords[0]!.sourceOccurrenceId).not.toBe(
      assigned.groupedRecords[1]!.sourceOccurrenceId,
    );
    expect(assigned.unstableOccurrenceItems).toHaveLength(2);
    expect(assigned.unstableOccurrenceItems[0]?.kind).toBe("unstable_occurrence_identity");
  });

  it("assigns occurrence ids for unresolved fields without verified identity keys", () => {
    const groups = [groupFor({ sourceDocumentId: "doc-a", recordTypeId: "student", instanceIndex: 0 })];
    const unresolved = proposedField({
      sourceDocumentId: "doc-a",
      recordTypeId: "student",
      instanceIndex: 0,
      fieldId: "legal_name",
      quote: "Alice Example",
      displayValue: "Alice Example",
    });
    const assigned = assignSourceOccurrenceIds({
      pack: SYNTHETIC_PACK,
      groupedRecords: groups,
      fieldOutcomes: [unresolved],
    });
    expect(assigned.groupedRecords[0]!.sourceOccurrenceId).toMatch(/^[a-f0-9]{16}$/);
    expect(assigned.groupedRecords[0]!.sourceOccurrenceAnchorBasis).toBe("proposed_page_quote");
  });

  it("uses distinct occurrence ids across documents with the same quoted text", () => {
    const quote = "Shared line text";
    const pagesA = mockPages("doc-a", 1, quote);
    const pagesB = mockPages("doc-b", 1, quote);
    const buildVerified = (sourceDocumentId: string, pages: DocumentPages, instanceIndex: number) => {
      const proposed = proposedField({
        sourceDocumentId,
        recordTypeId: "goal",
        instanceIndex,
        fieldId: "statement",
        quote,
        displayValue: quote,
      });
      const verified = verifyProposedField({
        field: { ...proposed, disposition: "verified" as const, reasons: [] },
        pack: SYNTHETIC_PACK,
        documentPages: pages,
      });
      expect(verified.status).toBe("verified");
      return {
        group: groupFor({ sourceDocumentId, recordTypeId: "goal", instanceIndex }),
        field: {
          ...proposed,
          disposition: "verified" as const,
          verifiedEvidence: verified.status === "verified" ? verified.verifiedEvidence : [],
          normalized: {
            valueKind: "text",
            displayValue: quote,
            normalizedValue: quote,
          },
          reasons: [] as [],
        },
      };
    };

    const a = buildVerified("doc-a", pagesA, 0);
    const b = buildVerified("doc-b", pagesB, 0);
    const assigned = assignSourceOccurrenceIds({
      pack: SYNTHETIC_PACK,
      groupedRecords: [a.group, b.group],
      fieldOutcomes: [a.field, b.field],
    });
    expect(assigned.groupedRecords[0]!.sourceOccurrenceId).not.toBe(
      assigned.groupedRecords[1]!.sourceOccurrenceId,
    );
  });

  it("buildCanonicalStudyFoundation emits sourceOccurrenceId on grouped records", () => {
    const foundation = buildCanonicalStudyFoundation({
      pack: SYNTHETIC_PACK,
      packContentSha256: "a".repeat(64),
      caseId: "case",
      documents: [
        {
          sourceDocumentId: "doc-a",
          documentPages: mockPages("doc-a", 1, "reading Read fluently"),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1",
            studyRunId: "run",
            attemptId: "attempt",
            sourceDocumentId: "doc-a",
            packId: "test",
            packVersion: "0.0.1",
            packContentSha256: "a".repeat(64),
            status: "SUCCEEDED",
            parsedModelJson: {
              documentTypeId: "doc.plan",
              records: [
                {
                  recordTypeId: "goal",
                  instanceIndex: 0,
                  fields: [{ fieldId: "statement", displayValue: "Read fluently", evidence: { page: 1, quote: "Read fluently" } }],
                },
              ],
            },
          },
        },
      ],
    });
    expect(foundation.groupedRecords.every((group) => group.sourceOccurrenceId?.length === 16)).toBe(true);
  });
});
