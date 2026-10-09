import { describe, expect, it } from "vitest";

import {
  readCompletedDiagnostics,
  resolveReaderQualificationFailureCode,
  type ReaderDiagnosticOutcome,
} from "./reader-qualification-diagnostics.js";

function completedTrace(outcome: ReaderDiagnosticOutcome, counts: Record<string, number>) {
  return [
    {
      event_type: "STARTED",
      study_run_id: "run-1",
      attempt_id: "attempt-1",
      case_id: "case-1",
      user_id: "user-1",
      event_payload: {},
    },
    {
      event_type: "COMPLETED",
      study_run_id: "run-1",
      attempt_id: "attempt-1",
      case_id: "case-1",
      user_id: "user-1",
      event_payload: {
        acceptedFactCount: 0,
        readerDiagnosticOutcome: outcome,
        ...counts,
      },
    },
  ];
}

describe("reader qualification diagnostics", () => {
  it.each([
    ["ZERO_CANDIDATES", "READER_ZERO_CANDIDATES"],
    ["CANDIDATES_WITHOUT_EVIDENCE", "READER_CANDIDATES_WITHOUT_EVIDENCE"],
    ["ALL_EVIDENCE_REJECTED", "READER_ALL_EVIDENCE_REJECTED"],
    ["VERIFIER_ERROR", "READER_VERIFIER_ERROR"],
  ] as const)("maps %s to %s", (outcome, code) => {
    const events = completedTrace(outcome, {
      candidateFactCount: outcome === "ZERO_CANDIDATES" ? 0 : 2,
      candidatesWithEvidenceCount:
        outcome === "CANDIDATES_WITHOUT_EVIDENCE" ? 0 : outcome === "ZERO_CANDIDATES" ? 0 : 2,
      verifierSubmissionCount: outcome === "ALL_EVIDENCE_REJECTED" ? 2 : 0,
      verifierErrorCount: outcome === "VERIFIER_ERROR" ? 1 : 0,
    });
    const diagnostics = readCompletedDiagnostics(events);
    expect(
      resolveReaderQualificationFailureCode({
        correlated: true,
        diagnostics,
        acceptedEvidenceEvents: 0,
      }),
    ).toBe(code);
  });

  it("returns trace correlation failure when lifecycle events are missing", () => {
    expect(
      resolveReaderQualificationFailureCode({
        correlated: false,
        diagnostics: null,
        acceptedEvidenceEvents: 0,
      }),
    ).toBe("READER_TRACE_CORRELATION_FAILED");
  });
});
