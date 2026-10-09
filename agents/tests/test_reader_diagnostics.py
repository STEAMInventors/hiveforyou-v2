from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import dspy
import pytest

from hive_agents.api_models import StudyReaderRequest
from hive_agents.app import execute_study_reader
from hive_agents.reader import (
    CandidateFactDraft,
    ConstructParts,
    ClaimValue,
    DocumentPage,
    HiveReaderModule,
    PageWord,
    ReaderRunResult,
    SourceEvidence,
    VerifierBackedReaderTools,
    ReaderVerifyContext,
)
from hive_agents.reader_diagnostics import (
    ReaderExecutionCounts,
    classify_reader_diagnostic_outcome,
    completed_audit_payload,
    fact_has_usable_evidence,
)
from hive_agents.settings import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _fact(*, with_evidence: bool) -> CandidateFactDraft:
    evidence = (
        [
            SourceEvidence(
                sourceDocumentId="doc-a",
                page=1,
                quote="Reading comprehension",
            )
        ]
        if with_evidence
        else []
    )
    return CandidateFactDraft(
        subjectEntityId="student-1",
        construct=ConstructParts(measure="reading_comprehension", task="annual goal"),
        value=ClaimValue(kind="text", textValue="Reading comprehension"),
        modality="planned",
        evidence=evidence,
    )


def test_classify_four_diagnostic_outcomes() -> None:
    assert (
        classify_reader_diagnostic_outcome(
            ReaderExecutionCounts(candidate_fact_count=0),
        )
        == "ZERO_CANDIDATES"
    )
    assert (
        classify_reader_diagnostic_outcome(
            ReaderExecutionCounts(candidate_fact_count=2, candidates_with_evidence_count=0),
        )
        == "CANDIDATES_WITHOUT_EVIDENCE"
    )
    assert (
        classify_reader_diagnostic_outcome(
            ReaderExecutionCounts(
                candidate_fact_count=2,
                candidates_with_evidence_count=2,
                verifier_submission_count=2,
                rejected_fact_count=2,
            ),
        )
        == "ALL_EVIDENCE_REJECTED"
    )
    assert (
        classify_reader_diagnostic_outcome(
            ReaderExecutionCounts(
                candidate_fact_count=1,
                candidates_with_evidence_count=1,
                verifier_submission_count=1,
                verifier_error_count=1,
            ),
        )
        == "VERIFIER_ERROR"
    )
    assert (
        classify_reader_diagnostic_outcome(
            ReaderExecutionCounts(accepted_fact_count=1),
        )
        is None
    )


def test_completed_payload_is_aggregate_only() -> None:
    counts = ReaderExecutionCounts(
        candidate_fact_count=3,
        candidates_with_evidence_count=2,
        verifier_submission_count=2,
        rejected_fact_count=2,
    )
    payload = completed_audit_payload(
        counts,
        duration_ms=10,
        reasoning_steps=1,
        tool_calls=2,
        input_tokens=100,
        output_tokens=50,
        cache_read_input_tokens=None,
        cache_write_input_tokens=None,
    )
    assert payload["readerDiagnosticOutcome"] == "ALL_EVIDENCE_REJECTED"
    serialized = json.dumps(payload)
    assert "quote" not in serialized
    assert "student" not in serialized.lower()


def test_verifier_error_emits_stable_reason_code() -> None:
    from hive_agents.verifier_client import ReaderVerifierError

    class FailVerifier:
        def verify_fact(self, **kwargs: Any) -> Any:
            raise ReaderVerifierError("verifier HTTP error")

    emitted: list[tuple[str, dict[str, Any]]] = []

    class Trace:
        def emit(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
            emitted.append((event_type, payload or {}))

    counts = ReaderExecutionCounts()
    tools = VerifierBackedReaderTools(
        [DocumentPage(documentId="doc-a", pageNumber=1, words=[PageWord(seq=0, text="x")])],
        FailVerifier(),
        ReaderVerifyContext(case_id="case", user_id="user"),
        trace=Trace(),
        execution_counts=counts,
    )
    tools.propose_fact(_fact(with_evidence=True))
    assert counts.verifier_error_count == 1
    assert emitted[0][0] == "FACT_PROPOSED"
    assert emitted[1][0] == "EVIDENCE_REJECTED"
    assert emitted[1][1]["reasonCodes"] == ["VERIFIER_ERROR"]
    assert "verifier HTTP error" not in json.dumps(emitted[1][1])


def test_execute_study_reader_completed_carries_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = StudyReaderRequest.model_validate(
        {
            "caseId": "case-l001",
            "userId": "user-internal",
            "domainId": "iep",
            "studyRunId": "33333333-3333-4333-8333-333333333333",
            "attemptId": "55555555-5555-4555-8555-555555555555",
            "documents": [
                {
                    "sourceDocumentId": "doc-a",
                    "pages": [
                        {
                            "pageNumber": 1,
                            "words": [{"seq": 0, "text": "Goal:"}],
                        }
                    ],
                }
            ],
        }
    )
    counts = ReaderExecutionCounts(candidate_fact_count=0)
    result = ReaderRunResult(
        candidate_facts=[],
        reasoning_steps=1,
        tool_calls=0,
        execution_counts=counts,
    )
    emitted: list[tuple[str, dict[str, Any]]] = []

    class FakeContext:
        model_id = "claude-test"

    class FakeSession:
        context = FakeContext()

        def emit(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
            emitted.append((event_type, payload or {}))

        def flush(self) -> None:
            return None

    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "0")
    monkeypatch.setenv("HIVE_AGENTS_SERVICE_TOKEN", "t")
    monkeypatch.setenv("HIVE_VERIFIER_TOKEN", "v")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "k")
    get_settings.cache_clear()
    monkeypatch.setattr("hive_agents.app.run_reader", lambda **_kwargs: result)
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock(spec=dspy.LM))
    monkeypatch.setattr("hive_agents.app._require_verifier_client", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app._build_trace_session", lambda *_args, **_kwargs: FakeSession())

    execute_study_reader(request)
    completed = next(payload for event_type, payload in emitted if event_type == "COMPLETED")
    assert completed["candidateFactCount"] == 0
    assert completed["readerDiagnosticOutcome"] == "ZERO_CANDIDATES"


def test_fact_has_usable_evidence() -> None:
    from hive_agents.reader import CandidateFact

    good = CandidateFact(
        id="fact-1",
        construct=ConstructParts(measure="m"),
        value=ClaimValue(kind="text", textValue="x"),
        modality="planned",
        evidence=[
            SourceEvidence(sourceDocumentId="doc-a", page=1, quote="hello"),
        ],
    )
    bad = CandidateFact(
        id="fact-2",
        construct=ConstructParts(measure="m"),
        value=ClaimValue(kind="text", textValue="x"),
        modality="planned",
        evidence=[SourceEvidence(sourceDocumentId="", page=0, quote="")],
    )
    assert fact_has_usable_evidence(good) is True
    assert fact_has_usable_evidence(bad) is False
