from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

from hive_agents.trace_client import ReaderTraceError, ReaderTraceFailureDetails

# Must match worker/src/trace/agent-run-trace-ingest.ts
AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH = 256
AGENT_RUN_TRACE_MAX_BODY_BYTES = 2 * 1024 * 1024


def trace_batch_serialized_byte_size(events: list[dict[str, Any]]) -> int:
    return len(json.dumps({"events": events}, separators=(",", ":")).encode("utf-8"))


def split_trace_event_batches(
    events: list[dict[str, Any]],
    *,
    max_events: int = AGENT_RUN_TRACE_MAX_EVENTS_PER_BATCH,
    max_bytes: int = AGENT_RUN_TRACE_MAX_BODY_BYTES,
) -> list[list[dict[str, Any]]]:
    if not events:
        return []
    batches: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []

    def flush_current() -> None:
        nonlocal current
        if current:
            batches.append(current)
            current = []

    for event in events:
        candidate = [*current, event]
        if len(candidate) > max_events:
            flush_current()
            candidate = [event]
        if trace_batch_serialized_byte_size(candidate) > max_bytes:
            if current:
                flush_current()
                candidate = [event]
            if trace_batch_serialized_byte_size(candidate) > max_bytes:
                raise ValueError("single trace event exceeds ingest body size limit")
        current = candidate
    flush_current()
    return batches

if TYPE_CHECKING:
    from hive_agents.trace_client import ReaderTraceClient


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class ReaderTraceContext:
    study_run_id: str
    attempt_id: str
    case_id: str
    user_id: str
    domain_id: str
    domain_pack_id: str
    domain_pack_version: str
    model_id: str
    source_document_ids: list[str]


@dataclass
class ReaderTraceSession:
    """Buffers trace events and flushes to the TypeScript ingest service in bounded batches."""

    context: ReaderTraceContext
    client: ReaderTraceClient
    _sequence: int = 0
    _buffer: list[dict[str, Any]] = field(default_factory=list)

    def emit(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        event = {
            "id": str(uuid.uuid4()),
            "studyRunId": self.context.study_run_id,
            "attemptId": self.context.attempt_id,
            "sequenceNumber": self._sequence,
            "caseId": self.context.case_id,
            "userId": self.context.user_id,
            "eventType": event_type,
            "occurredAt": _utc_now_iso(),
            "domainId": self.context.domain_id,
            "domainPackId": self.context.domain_pack_id,
            "domainPackVersion": self.context.domain_pack_version,
            "modelId": self.context.model_id,
            "sourceDocumentIds": list(self.context.source_document_ids),
            "payload": payload or {},
        }
        self._sequence += 1
        self._buffer.append(event)

    def flush(self) -> None:
        if not self._buffer:
            return
        events = self._buffer
        self._buffer = []
        try:
            batches = split_trace_event_batches(events)
        except ValueError as exc:
            raise ReaderTraceError(str(exc)) from exc
        events_persisted = 0
        batch_total = len(batches)
        for batch_index, batch in enumerate(batches):
            try:
                self.client.ingest_events(batch)
            except ReaderTraceError as exc:
                base_details = exc.details
                raise ReaderTraceError(
                    str(exc),
                    details=ReaderTraceFailureDetails(
                        http_status=base_details.http_status if base_details else None,
                        server_error_code=base_details.server_error_code if base_details else None,
                        event_count=base_details.event_count if base_details else len(batch),
                        batch_bytes=base_details.batch_bytes if base_details else 0,
                        batch_index=batch_index,
                        batch_total=batch_total,
                        events_persisted_before_failure=events_persisted,
                    ),
                ) from exc
            events_persisted += len(batch)

    def discard_buffer(self) -> None:
        self._buffer = []
