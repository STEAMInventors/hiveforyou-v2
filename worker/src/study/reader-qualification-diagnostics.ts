export type ReaderDiagnosticOutcome =
  | "ZERO_CANDIDATES"
  | "CANDIDATES_WITHOUT_EVIDENCE"
  | "ALL_EVIDENCE_REJECTED"
  | "VERIFIER_ERROR";

export type ReaderCompletedDiagnostics = {
  candidateFactCount: number;
  candidatesWithEvidenceCount: number;
  verifierSubmissionCount: number;
  acceptedFactCount: number;
  rejectedFactCount: number;
  verifierErrorCount: number;
  readerDiagnosticOutcome?: ReaderDiagnosticOutcome | null;
};

function readPayloadNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function readCompletedDiagnostics(
  events: Array<Record<string, unknown>>,
): ReaderCompletedDiagnostics | null {
  const completed = events.find((row) => String(row.event_type) === "COMPLETED");
  if (!completed) {
    return null;
  }
  const payload =
    completed.event_payload && typeof completed.event_payload === "object"
      ? (completed.event_payload as Record<string, unknown>)
      : {};
  const outcomeRaw = payload.readerDiagnosticOutcome;
  const readerDiagnosticOutcome =
    outcomeRaw === "ZERO_CANDIDATES" ||
    outcomeRaw === "CANDIDATES_WITHOUT_EVIDENCE" ||
    outcomeRaw === "ALL_EVIDENCE_REJECTED" ||
    outcomeRaw === "VERIFIER_ERROR"
      ? outcomeRaw
      : null;
  return {
    candidateFactCount: readPayloadNumber(payload, "candidateFactCount"),
    candidatesWithEvidenceCount: readPayloadNumber(payload, "candidatesWithEvidenceCount"),
    verifierSubmissionCount: readPayloadNumber(payload, "verifierSubmissionCount"),
    acceptedFactCount: readPayloadNumber(payload, "acceptedFactCount"),
    rejectedFactCount: readPayloadNumber(payload, "rejectedFactCount"),
    verifierErrorCount: readPayloadNumber(payload, "verifierErrorCount"),
    readerDiagnosticOutcome,
  };
}

export function resolveReaderQualificationFailureCode(input: {
  correlated: boolean;
  diagnostics: ReaderCompletedDiagnostics | null;
  acceptedEvidenceEvents: number;
}): string {
  if (!input.correlated) {
    return "READER_TRACE_CORRELATION_FAILED";
  }
  const acceptedFromPayload = input.diagnostics?.acceptedFactCount ?? 0;
  const accepted = Math.max(acceptedFromPayload, input.acceptedEvidenceEvents);
  if (accepted >= 1) {
    return "READER_QUALIFICATION_SUCCEEDED";
  }
  switch (input.diagnostics?.readerDiagnosticOutcome) {
    case "ZERO_CANDIDATES":
      return "READER_ZERO_CANDIDATES";
    case "CANDIDATES_WITHOUT_EVIDENCE":
      return "READER_CANDIDATES_WITHOUT_EVIDENCE";
    case "ALL_EVIDENCE_REJECTED":
      return "READER_ALL_EVIDENCE_REJECTED";
    case "VERIFIER_ERROR":
      return "READER_VERIFIER_ERROR";
    default:
      return "READER_ZERO_ACCEPTED_FACTS";
  }
}
