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


@dataclass
class ReaderExecutionCounts:
    candidate_fact_count: int = 0
    candidates_with_evidence_count: int = 0
    verifier_submission_count: int = 0
    accepted_fact_count: int = 0
    rejected_fact_count: int = 0
    verifier_error_count: int = 0

    def to_audit_payload(self) -> dict[str, int]:
        return {
            "candidateFactCount": self.candidate_fact_count,
            "candidatesWithEvidenceCount": self.candidates_with_evidence_count,
            "verifierSubmissionCount": self.verifier_submission_count,
            "acceptedFactCount": self.accepted_fact_count,
            "rejectedFactCount": self.rejected_fact_count,
            "verifierErrorCount": self.verifier_error_count,
        }


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
