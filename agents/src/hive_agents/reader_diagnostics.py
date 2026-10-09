from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

from hive_agents.reader import CandidateFact, SourceEvidence

ReaderDiagnosticOutcome = Literal[
    "ZERO_CANDIDATES",
    "CANDIDATES_WITHOUT_EVIDENCE",
    "ALL_EVIDENCE_REJECTED",
    "VERIFIER_ERROR",
]

ReaderExtractionOutputType = Literal[
    "EXTRACTION_JSON_EMPTY",
    "CANDIDATE_FACTS_ARRAY_EMPTY",
    "PARSED_FACTS_LOST_IN_NORMALIZATION",
    "DSPY_OUTPUT_FIELD_MISMATCH",
]


@dataclass
class ReaderExecutionCounts:
    candidate_fact_count: int = 0
    candidates_with_evidence_count: int = 0
    verifier_submission_count: int = 0
    accepted_fact_count: int = 0
    rejected_fact_count: int = 0
    verifier_error_count: int = 0
    extraction_json_length: int = 0
    raw_parsed_fact_count: int = 0
    normalization_dropped_fact_count: int = 0
    reader_extraction_output_type: ReaderExtractionOutputType | None = None

    def to_audit_payload(self) -> dict[str, int | str]:
        payload: dict[str, int | str] = {
            "candidateFactCount": self.candidate_fact_count,
            "candidatesWithEvidenceCount": self.candidates_with_evidence_count,
            "verifierSubmissionCount": self.verifier_submission_count,
            "acceptedFactCount": self.accepted_fact_count,
            "rejectedFactCount": self.rejected_fact_count,
            "verifierErrorCount": self.verifier_error_count,
            "extractionJsonLength": self.extraction_json_length,
            "rawParsedFactCount": self.raw_parsed_fact_count,
            "normalizationDroppedFactCount": self.normalization_dropped_fact_count,
        }
        if self.reader_extraction_output_type is not None:
            payload["readerExtractionOutputType"] = self.reader_extraction_output_type
        return payload


def evidence_is_usable(evidence: SourceEvidence) -> bool:
    return (
        bool(str(evidence.sourceDocumentId).strip())
        and int(evidence.page) >= 1
        and bool(str(evidence.quote).strip())
    )


def fact_has_usable_evidence(fact: CandidateFact) -> bool:
    if not fact.evidence:
        return False
    return evidence_is_usable(fact.evidence[0])


def classify_reader_extraction_output(
    *,
    extraction_json_length: int,
    raw_parsed_fact_count: int,
    candidate_fact_count: int,
    normalization_dropped_fact_count: int,
) -> ReaderExtractionOutputType | None:
    """Classify extraction_json using aggregate counts only."""
    if candidate_fact_count > 0:
        return None
    if extraction_json_length == 0:
        return "EXTRACTION_JSON_EMPTY"
    if (
        normalization_dropped_fact_count > 0
        and raw_parsed_fact_count > candidate_fact_count
    ):
        return "PARSED_FACTS_LOST_IN_NORMALIZATION"
    if raw_parsed_fact_count == 0:
        return "CANDIDATE_FACTS_ARRAY_EMPTY"
    return None


def classify_reader_diagnostic_outcome(
    counts: ReaderExecutionCounts,
) -> ReaderDiagnosticOutcome | None:
    """Return a stable outcome when no facts were accepted; None when acceptance succeeded."""
    if counts.accepted_fact_count > 0:
        return None
    if counts.verifier_error_count > 0:
        return "VERIFIER_ERROR"
    if counts.candidate_fact_count == 0:
        return "ZERO_CANDIDATES"
    if counts.candidates_with_evidence_count == 0:
        return "CANDIDATES_WITHOUT_EVIDENCE"
    if counts.verifier_submission_count > 0:
        return "ALL_EVIDENCE_REJECTED"
    return "CANDIDATES_WITHOUT_EVIDENCE"


def completed_audit_payload(
    counts: ReaderExecutionCounts,
    *,
    duration_ms: int,
    reasoning_steps: int,
    tool_calls: int,
    input_tokens: int | None,
    output_tokens: int | None,
    cache_read_input_tokens: int | None,
    cache_write_input_tokens: int | None,
) -> dict[str, int | str | None]:
    outcome = classify_reader_diagnostic_outcome(counts)
    payload: dict[str, int | str | None] = {
        "durationMs": duration_ms,
        "reasoningSteps": reasoning_steps,
        "toolCalls": tool_calls,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "cacheReadInputTokens": cache_read_input_tokens,
        "cacheWriteInputTokens": cache_write_input_tokens,
        **counts.to_audit_payload(),
    }
    if outcome is not None:
        payload["readerDiagnosticOutcome"] = outcome
    return payload


def counts_as_dict(counts: ReaderExecutionCounts) -> dict[str, int]:
    return asdict(counts)
