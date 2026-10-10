import type { PageModel } from "@hiveforyou/core/document/page-model";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { describe, expect, it } from "vitest";

import type { GradeCorpusContext } from "../grade.js";
import type { GoldenCase } from "../golden/types.js";
import {
  assessStudyRunGradeability,
  buildReaderGoldenComparisonReport,
  buildStudyRunTraceAudit,
  gradeReaderFactsAgainstGolden,
  parseAcceptedReaderFactsJson,
  resolveGradeableAttemptId,
  type ReaderExperimentCandidateFact,
} from "./fact-match.js";

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
          value: { kind: "text", textValue: "Alpha" },
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

describe("buildReaderGoldenComparisonReport", () => {
  it("counts duplicate candidates separately", () => {
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
          value: { kind: "text", textValue: "Alpha" },
          acceptableModalities: ["observed"],
        },
      ],
      gaps: [],
      tripwires: [],
    };
    const value = golden.facts[0]!.value;
    const mk = (id: string): ReaderExperimentCandidateFact => ({
      id,
      construct: { measure: "demo" },
      value,
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
    });
    const page = pageModelFromWords(docId, 1, ["Alpha"]);
    const recovered: NestIepRecoveredPage = {
      runId: "run_test",
      sourceDocumentId: docId,
      pageNumber: 1,
      extractionMethod: "NATIVE",
      canonicalText: "Alpha",
      lines: [],
      blocks: [],
      sourceIssues: [],
    };
    const ctx: GradeCorpusContext = {
      pageModelsByDocumentId: new Map([[docId, [page]]]),
      recoveredPagesByDocumentId: new Map([[docId, [recovered]]]),
    };
    const report = buildReaderGoldenComparisonReport({
      golden,
      candidates: [mk("c1"), mk("c2")],
      corpus: ctx,
    });
    expect(report.summary.duplicateCandidateCount).toBe(1);
    expect(report.summary.matchedGoldenCount).toBe(1);
  });
});

describe("resolveGradeableAttemptId", () => {
  it("uses artifact attemptId and ignores stale retry attempts", () => {
    const events = [
      {
        event_type: "STARTED",
        event_payload: {},
        attempt_id: "failed-attempt",
        sequence_number: 0,
      },
      {
        event_type: "EVIDENCE_ACCEPTED",
        event_payload: {},
        attempt_id: "failed-attempt",
        sequence_number: 1,
      },
      {
        event_type: "STARTED",
        event_payload: {},
        attempt_id: "success-attempt",
        sequence_number: 10,
      },
      {
        event_type: "COMPLETED",
        event_payload: { acceptedFactCount: 1 },
        attempt_id: "success-attempt",
        sequence_number: 11,
      },
    ];
    expect(resolveGradeableAttemptId(events, "success-attempt")).toBe("success-attempt");
    const audit = buildStudyRunTraceAudit("run-1", events, "success-attempt");
    expect(audit.acceptedEvidenceEventCount).toBe(0);
    expect(audit.traceEventCount).toBe(2);
  });
});

describe("assessStudyRunGradeability", () => {
  it("requires accepted fact export, not trace counts alone", () => {
    const assessment = assessStudyRunGradeability({
      studyRunId: "run-1",
      traceEvents: [
        {
          event_type: "EVIDENCE_ACCEPTED",
          event_payload: { candidateFactId: "reader-candidate-abc" },
          attempt_id: "attempt-1",
          sequence_number: 1,
        },
      ],
      acceptedFactsFilePresent: false,
    });
    expect(assessment.gradeable).toBe(false);
  });
});

describe("parseAcceptedReaderFactsJson", () => {
  it("accepts reader-accepted-facts/1", () => {
    expect(
      parseAcceptedReaderFactsJson({
        schemaVersion: "reader-accepted-facts/1",
        studyRunId: "x",
        facts: [],
      }),
    ).toEqual([]);
  });
});
