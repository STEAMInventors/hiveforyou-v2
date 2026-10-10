import type { PageModel } from "@hiveforyou/core/document/page-model";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { describe, expect, it } from "vitest";

import type { GradeCorpusContext } from "../grade.js";
import type { GoldenCase } from "../golden/types.js";
import { gradeReaderFactsAgainstGolden, type ReaderExperimentCandidateFact } from "./fact-match.js";

function pageModelFromWords(documentId: string, pageNumber: number, texts: string[]): PageModel {
  return {
    documentId,
    pageNumber,
    width: 612,
    height: 792,
    rotation: 0,
    route: "native",
    quality: { garbageRatio: 0, illegibleRegions: [], meanConfidence: null, textCoverage: null },
    imageRef: null,
    words: texts.map((text, seq) => ({
      text,
      seq,
      source: "native" as const,
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      fontName: null,
      fontSize: 10,
      bold: null,
      italic: null,
      confidence: null,
    })),
  };
}

describe("gradeReaderFactsAgainstGolden", () => {
  it("computes precision and recall for overlapping accepted candidate", () => {
    const docId = "doc.pdf";
    const golden: GoldenCase = {
      caseId: "l001",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      verifiedBy: "test",
      facts: [
        {
          id: "f1",
          documentId: docId,
          pageNumber: 1,
          wordRange: [0, 1],
          valueKind: "text",
          value: {
            kind: "text",
            textValue: "Alpha",
            numberValue: null,
            codeValue: null,
            booleanValue: null,
            entityId: null,
            dateValue: null,
            periodStart: null,
            periodEnd: null,
            unit: null,
          },
          acceptableModalities: ["observed"],
        },
      ],
      gaps: [],
      tripwires: [],
    };
    const candidates: ReaderExperimentCandidateFact[] = [
      {
        id: "c1",
        construct: { measure: "demo" },
        value: golden.facts[0]!.value,
        modality: "observed",
        evidenceRefs: [
          {
            id: "e1",
            sourceDocumentId: docId,
            page: 1,
            quote: "Alpha",
            sourceType: "document",
          },
        ],
      },
    ];
    const page = pageModelFromWords(docId, 1, ["Alpha", "Beta"]);
    const recovered: NestIepRecoveredPage = {
      runId: "run_test",
      sourceDocumentId: docId,
      pageNumber: 1,
      extractionMethod: "NATIVE",
      canonicalText: "Alpha Beta",
      lines: [],
      blocks: [],
      sourceIssues: [],
    };
    const ctx: GradeCorpusContext = {
      pageModelsByDocumentId: new Map([[docId, [page]]]),
      recoveredPagesByDocumentId: new Map([[docId, [recovered]]]),
    };
    const metrics = gradeReaderFactsAgainstGolden({ golden, candidates, corpus: ctx });
    expect(metrics.matchedCount).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.fullCaseRecall).toBe(true);
  });
});
