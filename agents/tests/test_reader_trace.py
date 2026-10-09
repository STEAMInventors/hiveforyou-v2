from __future__ import annotations

import pytest

from hive_agents.trace_client import ReaderTraceClient, ReaderTraceConfig, ReaderTraceError
from hive_agents.trace_emitter import ReaderTraceContext, ReaderTraceSession


class FakeTransport:
    def __init__(self) -> None:
        self.bodies: list[dict] = []

    def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
        self.bodies.append(kwargs["body"])
        return {"results": [{"id": "x", "outcome": "inserted"}]}


def test_trace_session_emits_bounded_payloads() -> None:
    transport = FakeTransport()
    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=transport,
    )
    session = ReaderTraceSession(
        context=ReaderTraceContext(
            study_run_id="33333333-3333-4333-8333-333333333333",
            attempt_id="55555555-5555-4555-8555-555555555555",
            case_id="44444444-4444-4444-8444-444444444444",
            user_id="11111111-1111-4111-8111-111111111111",
            domain_id="iep",
            domain_pack_id="iep",
            domain_pack_version="1",
            model_id="claude-test",
            source_document_ids=["doc-a"],
        ),
        client=client,
    )
    session.emit("TOOL_CALLED", {"tool": "search", "hitCount": 0, "queryLength": 3})
    session.emit(
        "FACT_PROPOSED",
        {"candidateFactId": "c1", "sourceDocumentId": "doc-a", "page": 1},
    )
    session.flush()
    assert len(transport.bodies) == 1
    events = transport.bodies[0]["events"]
    assert len(events) == 2
    assert events[0]["sequenceNumber"] == 0
    assert events[1]["sequenceNumber"] == 1
    serialized = str(events)
    assert "quote" not in serialized
    assert "prompt" not in serialized


def test_reader_marks_verifier_trace_as_python_observed() -> None:
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / "src/hive_agents/reader.py").read_text(
        encoding="utf-8"
    )
    assert '"decisionAuthority": "python_verifier_client"' in text
    assert '"authoritative": False' in text


def test_trace_client_surfaces_http_failure() -> None:
    class FailTransport:
        def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
            raise ReaderTraceError("trace HTTP error")

    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=FailTransport(),
    )
    session = ReaderTraceSession(
        context=ReaderTraceContext(
            study_run_id="33333333-3333-4333-8333-333333333333",
            attempt_id="55555555-5555-4555-8555-555555555555",
            case_id="44444444-4444-4444-8444-444444444444",
            user_id="11111111-1111-4111-8111-111111111111",
            domain_id="iep",
            domain_pack_id="iep",
            domain_pack_version="1",
            model_id="claude-test",
            source_document_ids=["doc-a"],
        ),
        client=client,
    )
    session.emit("STARTED", {})
    with pytest.raises(ReaderTraceError):
        session.flush()
