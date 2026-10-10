from __future__ import annotations

import json

import pytest

from hive_agents.trace_client import (
    ReaderTraceClient,
    ReaderTraceConfig,
    ReaderTraceError,
    ReaderTraceFailureDetails,
    UrllibReaderTraceTransport,
    trace_batch_serialized_byte_size,
)
from hive_agents.trace_emitter import (
    AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH,
    ReaderTraceContext,
    ReaderTraceSession,
    split_trace_event_batches,
)


class FakeTransport:
    def __init__(self) -> None:
        self.bodies: list[dict] = []

    def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
        self.bodies.append(kwargs["body"])
        events = kwargs["body"]["events"]
        return {
            "results": [{"id": event["id"], "outcome": "inserted"} for event in events],
        }


def _sample_context() -> ReaderTraceContext:
    return ReaderTraceContext(
        study_run_id="33333333-3333-4333-8333-333333333333",
        attempt_id="55555555-5555-4555-8555-555555555555",
        case_id="44444444-4444-4444-8444-444444444444",
        user_id="11111111-1111-4111-8111-111111111111",
        domain_id="iep",
        domain_pack_id="iep",
        domain_pack_version="1",
        model_id="claude-test",
        source_document_ids=["doc-a"],
    )


def _minimal_event(sequence: int) -> dict:
    ctx = _sample_context()
    return {
        "id": f"{sequence:08x}-0000-4000-8000-{sequence:012x}",
        "studyRunId": ctx.study_run_id,
        "attemptId": ctx.attempt_id,
        "sequenceNumber": sequence,
        "caseId": ctx.case_id,
        "userId": ctx.user_id,
        "eventType": "TOOL_CALLED",
        "occurredAt": "2026-10-09T12:00:00.000Z",
        "domainId": ctx.domain_id,
        "domainPackId": ctx.domain_pack_id,
        "domainPackVersion": ctx.domain_pack_version,
        "modelId": ctx.model_id,
        "sourceDocumentIds": list(ctx.source_document_ids),
        "payload": {"tool": "search", "hitCount": 0, "queryLength": 3},
    }


def test_trace_session_emits_bounded_payloads() -> None:
    transport = FakeTransport()
    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=transport,
    )
    session = ReaderTraceSession(context=_sample_context(), client=client)
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


def test_flush_splits_when_event_count_exceeds_ingest_limit() -> None:
    transport = FakeTransport()
    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=transport,
    )
    session = ReaderTraceSession(context=_sample_context(), client=client)
    # Variant B verification: up to two events per fact; 130 facts → 260 events + STARTED/COMPLETED.
    for _ in range(130):
        session.emit("FACT_PROPOSED", {"candidateFactId": "c1", "sourceDocumentId": "doc-a", "page": 1})
        session.emit(
            "EVIDENCE_ACCEPTED",
            {"candidateFactId": "c1", "reasonCodes": ["QUOTE_MATCH"]},
        )
    session.emit("STARTED", {"modelId": "claude-test"})
    session.flush()
    assert len(transport.bodies) >= 2
    total_events = sum(len(body["events"]) for body in transport.bodies)
    assert total_events == 261
    for body in transport.bodies:
        assert len(body["events"]) <= AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH
    flattened = [event for body in transport.bodies for event in body["events"]]
    assert [event["sequenceNumber"] for event in flattened] == list(range(261))


def test_split_trace_event_batches_respects_byte_limit() -> None:
    heavy_payload = {"reasonCodes": ["X" * 80_000]}
    events = [_minimal_event(index) for index in range(30)]
    for event in events:
        event["payload"] = heavy_payload
    batches = split_trace_event_batches(events)
    assert len(batches) > 1
    for batch in batches:
        assert trace_batch_serialized_byte_size(batch) <= 2 * 1024 * 1024


def test_reader_marks_verifier_trace_as_python_observed() -> None:
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / "src/hive_agents/reader.py").read_text(
        encoding="utf-8"
    )
    assert '"decisionAuthority": "python_verifier_client"' in text
    assert '"authoritative": False' in text


def test_trace_client_surfaces_http_failure_with_diagnostics() -> None:
    class FailTransport:
        def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
            raise ReaderTraceError(
                "trace ingest failed: eventCount=1 batchBytes=10 httpStatus=400 "
                "serverErrorCode=PAYLOAD_TOO_LARGE",
                details=ReaderTraceFailureDetails(
                    http_status=400,
                    server_error_code="PAYLOAD_TOO_LARGE",
                    event_count=1,
                    batch_bytes=10,
                ),
            )

    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=FailTransport(),
    )
    session = ReaderTraceSession(context=_sample_context(), client=client)
    session.emit("STARTED", {})
    with pytest.raises(ReaderTraceError) as raised:
        session.flush()
    assert raised.value.details is not None
    assert raised.value.details.server_error_code == "PAYLOAD_TOO_LARGE"
    assert raised.value.details.http_status == 400


def test_trace_client_rejects_partial_result_count() -> None:
    class ShortResultsTransport:
        def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
            return {"results": []}

    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=ShortResultsTransport(),
    )
    with pytest.raises(ReaderTraceError) as raised:
        client.ingest_events([_minimal_event(0)])
    assert raised.value.details is not None
    assert raised.value.details.server_error_code == "RESULT_COUNT_MISMATCH"


def test_urllib_transport_parses_api_error_code_without_body_leak() -> None:
    import io
    import urllib.error

    transport = UrllibReaderTraceTransport()
    body = json.dumps({"events": [_minimal_event(0)]}).encode("utf-8")
    error = urllib.error.HTTPError(
        url="http://127.0.0.1/internal/agent-run-trace/events",
        code=400,
        msg="Bad Request",
        hdrs=None,
        fp=io.BytesIO(
            json.dumps(
                {"error": {"code": "PAYLOAD_TOO_LARGE", "message": "Too many events in one batch."}}
            ).encode("utf-8")
        ),
    )

    class BrokenUrlopen:
        def __enter__(self):  # type: ignore[no-untyped-def]
            raise error

        def __exit__(self, *args):  # type: ignore[no-untyped-def]
            return False

    import hive_agents.trace_client as trace_client_module

    original = trace_client_module.urllib.request.urlopen
    trace_client_module.urllib.request.urlopen = lambda *args, **kwargs: BrokenUrlopen()  # type: ignore[assignment]
    try:
        with pytest.raises(ReaderTraceError) as raised:
            transport.post_json(
                url="http://127.0.0.1/internal/agent-run-trace/events",
                token="secret-token",
                body={"events": [_minimal_event(0)]},
                timeout_seconds=5.0,
            )
    finally:
        trace_client_module.urllib.request.urlopen = original

    assert raised.value.details is not None
    assert raised.value.details.http_status == 400
    assert raised.value.details.server_error_code == "PAYLOAD_TOO_LARGE"
    assert "secret-token" not in str(raised.value)


def test_multi_batch_flush_fails_closed_after_partial_success() -> None:
    calls = {"count": 0}

    class PartialFailTransport:
        def post_json(self, **kwargs):  # type: ignore[no-untyped-def]
            calls["count"] += 1
            if calls["count"] == 1:
                events = kwargs["body"]["events"]
                return {
                    "results": [{"id": event["id"], "outcome": "inserted"} for event in events],
                }
            raise ReaderTraceError(
                "trace ingest failed: eventCount=1 batchBytes=10 httpStatus=500 "
                "serverErrorCode=TRACE_PERSIST_FAILED",
                details=ReaderTraceFailureDetails(
                    http_status=500,
                    server_error_code="TRACE_PERSIST_FAILED",
                    event_count=1,
                    batch_bytes=10,
                ),
            )

    client = ReaderTraceClient(
        ReaderTraceConfig(base_url="http://127.0.0.1:4319", token="t"),
        transport=PartialFailTransport(),
    )
    session = ReaderTraceSession(context=_sample_context(), client=client)
    for index in range(AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH + 1):
        session.emit("TOOL_CALLED", {"tool": "search", "hitCount": 0, "queryLength": index})
    with pytest.raises(ReaderTraceError) as raised:
        session.flush()
    assert calls["count"] == 2
    assert raised.value.details is not None
    assert raised.value.details.events_persisted_before_failure == AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH
    assert raised.value.details.batch_index == 1
