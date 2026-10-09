from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

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
    """Buffers bounded trace events and flushes to the TypeScript ingest service."""

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
        batch = self._buffer
        self._buffer = []
        self.client.ingest_events(batch)

    def discard_buffer(self) -> None:
        self._buffer = []
