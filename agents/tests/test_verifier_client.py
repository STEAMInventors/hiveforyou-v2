from __future__ import annotations

from typing import Any

import pytest

from hive_agents.reader import (
    CandidateFactDraft,
    ClaimValue,
    ConstructParts,
    DocumentPage,
    InMemoryReaderTools,
    PageWord,
    ReaderVerifyContext,
    SourceEvidence,
    VerifierBackedReaderTools,
)
from hive_agents.verifier_client import (
    ReaderVerifierClient,
    ReaderVerifierConfig,
    ReaderVerifierError,
    ReaderVerifierResult,
)


class MockTransport:
    def __init__(self, response: dict[str, Any] | None = None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def post_json(
        self,
        *,
        url: str,
        token: str,
        body: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        self.calls.append(
            {"url": url, "token": token, "body": body, "timeout_seconds": timeout_seconds}
        )
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


def _sample_fact() -> CandidateFactDraft:
    return CandidateFactDraft(
        construct=ConstructParts(measure="reading"),
        value=ClaimValue(kind="text", textValue="Reading comprehension"),
        modality="planned",
        evidence=[
            SourceEvidence(
                sourceDocumentId="doc-a",
                page=1,
                quote="Reading comprehension",
                spanStart=1,
                spanEnd=2,
            )
        ],
    )


def test_client_accepts_verified_response() -> None:
    transport = MockTransport(
        response={
            "accepted": True,
            "reasons": [],
            "verifiedEvidence": [
                {
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "quote": "Reading comprehension",
                    "spanStart": 1,
                    "spanEnd": 2,
                    "wordStartIndex": 1,
                    "wordEndIndex": 2,
                }
            ],
        }
    )
    client = ReaderVerifierClient(
        ReaderVerifierConfig(base_url="http://127.0.0.1:4319", token="secret"),
        transport=transport,
    )
    result = client.verify_fact(case_id="case-1", user_id="user-1", fact=_sample_fact())
    assert result.accepted is True
    assert result.reasons == []


def test_client_fail_closed_on_malformed_response() -> None:
    transport = MockTransport(response={"accepted": True})
    client = ReaderVerifierClient(
        ReaderVerifierConfig(base_url="http://127.0.0.1:4319", token="secret"),
        transport=transport,
    )
    with pytest.raises(ReaderVerifierError, match="malformed"):
        client.verify_fact(case_id="case-1", user_id="user-1", fact=_sample_fact())


def test_client_fail_closed_on_transport_error() -> None:
    transport = MockTransport(error=ReaderVerifierError("verifier unavailable"))
    client = ReaderVerifierClient(
        ReaderVerifierConfig(base_url="http://127.0.0.1:4319", token="secret"),
        transport=transport,
    )
    with pytest.raises(ReaderVerifierError, match="unavailable"):
        client.verify_fact(case_id="case-1", user_id="user-1", fact=_sample_fact())


def test_verifier_backed_tools_rejects_without_persisting() -> None:
    pages = [
        DocumentPage(
            documentId="doc-a",
            pageNumber=1,
            words=[
                PageWord(seq=0, text="Goal:"),
                PageWord(seq=1, text="Reading"),
                PageWord(seq=2, text="comprehension"),
            ],
        )
    ]

    class RejectClient:
        def verify_fact(self, **kwargs: Any) -> ReaderVerifierResult:
            return ReaderVerifierResult(accepted=False, reasons=["quote mismatch"], verified_evidence=[])

    tools = VerifierBackedReaderTools(
        pages,
        RejectClient(),
        ReaderVerifyContext(case_id="case-1", user_id="user-1"),
    )
    response = tools.propose_fact(_sample_fact())
    assert response.startswith("REJECTED:")
    assert tools.proposed_facts == []


def test_verifier_backed_tools_accepts_via_inner_memory() -> None:
    pages = [
        DocumentPage(
            documentId="doc-a",
            pageNumber=1,
            words=[PageWord(seq=1, text="Reading")],
        )
    ]

    class AcceptClient:
        def verify_fact(self, **kwargs: Any) -> ReaderVerifierResult:
            return ReaderVerifierResult(
                accepted=True,
                reasons=[],
                verified_evidence=[{"sourceDocumentId": "doc-a", "page": 1, "quote": "Reading"}],
            )

    tools = VerifierBackedReaderTools(
        pages,
        AcceptClient(),
        ReaderVerifyContext(case_id="case-1", user_id="user-1"),
    )
    fact_id = tools.propose_fact(_sample_fact())
    assert not fact_id.startswith("REJECTED:")
    assert len(tools.proposed_facts) == 1
    assert tools.proposed_facts[0].verificationStatus == "proposed"


def test_in_memory_tools_unchanged_for_offline_use() -> None:
    pages = [
        DocumentPage(
            documentId="doc-a",
            pageNumber=1,
            words=[PageWord(seq=0, text="Speech")],
        )
    ]
    tools = InMemoryReaderTools(pages)
    fact_id = tools.propose_fact(_sample_fact())
    assert fact_id
    assert len(tools.proposed_facts) == 1
