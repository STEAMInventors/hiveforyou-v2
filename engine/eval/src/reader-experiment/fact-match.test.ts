import { L001_QUALIFICATION_SOURCE_SHA256 } from "@hiveforyou/core/study";
import type { PageModel } from "@hiveforyou/core/document/page-model";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { enrichL001GradeCorpusWithRegisteredDocuments, loadGradeCorpusForGolden } from "../eval/load-grade-corpus.js";
import type { GradeCorpusContext } from "../grade.js";
import type { GoldenCase } from "../golden/types.js";
import {
  assessStudyRunGradeability,
  buildReaderGoldenComparisonReport,
  buildReaderGoldenMismatchAuditReport,
  buildStudyRunTraceAudit,
  classifyUnmatchedGoldenFactWithCandidate,
  collectReaderGoldenMatchDiagnostics,
  gradeReaderFactsAgainstGolden,
  parseAcceptedReaderFactsJson,
  proposeStrictValueEquivalence,
  readerGoldenCorpusMappingFailure,
  resolveGradeableAttemptId,
  type ReaderExperimentCandidateFact,
} from "./fact-match.js";

const evalRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = resolve(evalRoot, "../..");

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

describe("L001 UUID sourceDocumentId corpus mapping", () => {
  it("maps production UUIDs to golden filenames and resolves quote overlap", async () => {
    const baseCorpus = await loadGradeCorpusForGolden({
      repoRoot,
      goldenCaseId: "l001",
      corpusDirRel: "engine/intake/fixtures/l001",
    });
    const registered = L001_QUALIFICATION_SOURCE_SHA256.map((sha256, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sha256,
    }));
    const corpus = enrichL001GradeCorpusWithRegisteredDocuments(baseCorpus, registered);
    const sourceDocumentId = registered[0]!.id;
    const golden: GoldenCase = {
      caseId: "l001",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      verifiedBy: "test",
      facts: [
        {
          id: "f-ref-student",
          documentId: "01_initial_referral.pdf",
          pageNumber: 1,
          wordRange: [26, 27],
          valueKind: "text",
          value: { kind: "text", textValue: "Maya Carter" },
          acceptableModalities: ["observed"],
        },
      ],
      gaps: [],
      tripwires: [],
    };
    const candidates: ReaderExperimentCandidateFact[] = [
      {
        id: "c1",
        construct: { measure: "student_name" },
        value: golden.facts[0]!.value,
        modality: "observed",
        evidenceRefs: [
          {
            id: "e1",
            sourceDocumentId,
            page: 1,
            quote: "Maya Carter",
            sourceType: "document",
          },
        ],
      },
    ];
    const diagnostics = collectReaderGoldenMatchDiagnostics({ golden, candidates, corpus });
    expect(diagnostics.documentIdResolvedCount).toBe(1);
    expect(diagnostics.pageResolvedCount).toBe(1);
    expect(diagnostics.quoteMappedToWordRangeCount).toBe(1);
    expect(diagnostics.goldenRangeOverlapCount).toBeGreaterThan(0);
    expect(readerGoldenCorpusMappingFailure({ candidateCount: 1, diagnostics })).toBeNull();

    const report = buildReaderGoldenComparisonReport({ golden, candidates, corpus });
    expect(report.summary.matchedGoldenCount).toBe(1);
    expect(report.corpusMappingBlocked).toBe(false);
  });

  it("fail-closes when UUIDs are not registered in the corpus map", async () => {
    const baseCorpus = await loadGradeCorpusForGolden({
      repoRoot,
      goldenCaseId: "l001",
      corpusDirRel: join("engine/intake/fixtures/l001").replace(/\\/g, "/"),
    });
    const golden: GoldenCase = {
      caseId: "l001",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      verifiedBy: "test",
      facts: [
        {
          id: "f1",
          documentId: "01_initial_referral.pdf",
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
            sourceDocumentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            page: 1,
            quote: "Alpha",
            sourceType: "document",
          },
        ],
      },
    ];
    const diagnostics = collectReaderGoldenMatchDiagnostics({
      golden,
      candidates,
      corpus: baseCorpus,
    });
    expect(diagnostics.documentIdResolvedCount).toBe(0);
    expect(
      readerGoldenCorpusMappingFailure({ candidateCount: candidates.length, diagnostics }),
    ).toMatch(/Corpus mapping failed/);
  });
});

describe("reader golden mismatch audit", () => {
  it("detects whitespace-only text mismatch as grader equivalence candidate", () => {
    const result = proposeStrictValueEquivalence(
      { kind: "text", textValue: "Goal Area" },
      { kind: "text", textValue: "  goal area  " },
    );
    expect(result.equivalent).toBe(true);
    if (result.equivalent) {
      expect(result.rule).toBe("text_whitespace_case_insensitive");
    }
  });

  it("classifies modality mismatch when value already matches", () => {
    const fact = {
      id: "clm_demo",
      documentId: "doc.pdf",
      pageNumber: 1,
      wordRange: [0, 1] as [number, number],
      valueKind: "date" as const,
      value: { kind: "date" as const, dateValue: "2024-11-12" },
      acceptableModalities: ["observed" as const],
    };
    const classified = classifyUnmatchedGoldenFactWithCandidate({
      fact,
      graderStatus: "overlap_modality_mismatch",
      closest: {
        candidateId: "c1",
        constructMeasure: "iep_date",
        candidateModality: "planned",
        candidateValueKind: "date",
        resolvedDocumentId: "doc.pdf",
        candidatePage: 1,
        sameDocument: true,
        samePage: true,
        evidenceOverlap: true,
        constructMatch: true,
        valueMatch: true,
        modalityMatch: false,
        rankScore: 100,
      },
      candidateValue: { kind: "date", dateValue: "2024-11-12" },
    });
    expect(classified.classification).toBe("MODALITY_EXTRACTION_ERROR");
  });

  it("builds audit rows without changing official comparison summary", () => {
    const golden: GoldenCase = {
      caseId: "l001",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      verifiedBy: "test",
      facts: [
        {
          id: "f1",
          documentId: "08_initial_iep.pdf",
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
    const comparison = buildReaderGoldenComparisonReport({
      golden,
      candidates: [],
      corpus: { pageModelsByDocumentId: new Map(), recoveredPagesByDocumentId: new Map() },
    });
    const audit = buildReaderGoldenMismatchAuditReport({
      golden,
      comparison,
      candidates: [],
      corpus: { pageModelsByDocumentId: new Map(), recoveredPagesByDocumentId: new Map() },
      documentFilter: "08_initial_iep.pdf",
    });
    expect(audit.rows).toHaveLength(1);
    expect(audit.classificationCounts.TRUE_OMISSION).toBe(1);
    expect(audit.officialComparisonSummary.recall).toBe(comparison.summary.recall);
  });
});
