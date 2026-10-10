from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

logger = logging.getLogger(__name__)


def trace_batch_serialized_byte_size(events: list[dict[str, Any]]) -> int:
    return len(json.dumps({"events": events}, separators=(",", ":")).encode("utf-8"))

_SAFE_SERVER_ERROR_CODE = re.compile(r"^[A-Z0-9_]{1,64}$")


class ReaderTraceTransport(Protocol):
    def post_json(
        self,
        *,
        url: str,
        token: str,
        body: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]: ...


@dataclass(frozen=True)
class ReaderTraceConfig:
    base_url: str
    token: str
    timeout_seconds: float = 15.0


@dataclass(frozen=True)
class ReaderTraceFailureDetails:
    http_status: int | None
    server_error_code: str | None
    event_count: int
    batch_bytes: int
    batch_index: int | None = None
    batch_total: int | None = None
    events_persisted_before_failure: int | None = None


class ReaderTraceError(Exception):
    """Trace ingest unavailable or response could not be trusted."""

    def __init__(
        self,
        message: str,
        *,
        details: ReaderTraceFailureDetails | None = None,
    ) -> None:
        super().__init__(message)
        self.details = details


def _sanitize_server_error_code(raw: str | None) -> str | None:
    if not raw:
        return None
    trimmed = raw.strip()
    if _SAFE_SERVER_ERROR_CODE.match(trimmed):
        return trimmed
    return "UNSAFE_ERROR_CODE"


def _parse_api_error_code(body: str) -> str | None:
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    error = parsed.get("error")
    if not isinstance(error, dict):
        return None
    code = error.get("code")
    return code if isinstance(code, str) else None


def _attempt_id_from_events(events: list[dict[str, Any]]) -> str | None:
    if not events:
        return None
    attempt_id = events[0].get("attemptId")
    return attempt_id if isinstance(attempt_id, str) else None


def _log_trace_ingest_failure(
    *,
    attempt_id: str | None,
    details: ReaderTraceFailureDetails,
) -> None:
    logger.warning(
        "trace ingest failed attemptId=%s httpStatus=%s serverErrorCode=%s "
        "eventCount=%s batchBytes=%s batchIndex=%s batchTotal=%s eventsPersistedBeforeFailure=%s",
        attempt_id or "unknown",
        details.http_status,
        details.server_error_code,
        details.event_count,
        details.batch_bytes,
        details.batch_index,
        details.batch_total,
        details.events_persisted_before_failure,
    )


def _format_failure_message(details: ReaderTraceFailureDetails) -> str:
    parts = [
        f"eventCount={details.event_count}",
        f"batchBytes={details.batch_bytes}",
    ]
    if details.http_status is not None:
        parts.append(f"httpStatus={details.http_status}")
    if details.server_error_code:
        parts.append(f"serverErrorCode={details.server_error_code}")
    if details.batch_index is not None and details.batch_total is not None:
        parts.append(f"batch={details.batch_index + 1}/{details.batch_total}")
    if details.events_persisted_before_failure:
        parts.append(f"eventsPersistedBeforeFailure={details.events_persisted_before_failure}")
    return "trace ingest failed: " + " ".join(parts)


class UrllibReaderTraceTransport:
    def post_json(
        self,
        *,
        url: str,
        token: str,
        body: dict[str, Any],
        timeout_seconds: float,
    ) -> dict[str, Any]:
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8", errors="replace")
            if exc.code in (401, 403):
                raise ReaderTraceError("trace authentication failed") from exc
            server_code = _sanitize_server_error_code(_parse_api_error_code(raw_body))
            events_raw = body.get("events")
            event_count = len(events_raw) if isinstance(events_raw, list) else 0
            details = ReaderTraceFailureDetails(
                http_status=exc.code,
                server_error_code=server_code,
                event_count=event_count,
                batch_bytes=len(payload),
            )
            raise ReaderTraceError(_format_failure_message(details), details=details) from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ReaderTraceError("trace ingest unavailable") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ReaderTraceError("trace returned malformed JSON") from exc
        if not isinstance(parsed, dict):
            raise ReaderTraceError("trace returned malformed response")
        return parsed


def reader_trace_config_from_env() -> ReaderTraceConfig | None:
    token = (
        os.environ.get("HIVE_AGENT_TRACE_TOKEN", "").strip()
        or os.environ.get("HIVE_VERIFIER_TOKEN", "").strip()
    )
    if not token:
        return None
    port = os.environ.get("HIVE_VERIFIER_PORT", "4319").strip()
    base = os.environ.get("HIVE_AGENT_TRACE_URL", f"http://127.0.0.1:{port}").strip().rstrip("/")
    timeout_raw = os.environ.get("HIVE_AGENT_TRACE_TIMEOUT_SECONDS", "15").strip()
    try:
        timeout = float(timeout_raw)
    except ValueError as exc:
        raise ReaderTraceError("invalid HIVE_AGENT_TRACE_TIMEOUT_SECONDS") from exc
    if timeout <= 0:
        raise ReaderTraceError("invalid HIVE_AGENT_TRACE_TIMEOUT_SECONDS")
    return ReaderTraceConfig(base_url=base, token=token, timeout_seconds=timeout)


class ReaderTraceClient:
    def __init__(
        self,
        config: ReaderTraceConfig,
        transport: ReaderTraceTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport or UrllibReaderTraceTransport()

    def ingest_events(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        if not events:
            raise ReaderTraceError("trace batch must not be empty")
        batch_bytes = trace_batch_serialized_byte_size(events)
        event_count = len(events)
        attempt_id = _attempt_id_from_events(events)
        url = f"{self._config.base_url}/internal/agent-run-trace/events"
        try:
            parsed = self._transport.post_json(
                url=url,
                token=self._config.token,
                body={"events": events},
                timeout_seconds=self._config.timeout_seconds,
            )
        except ReaderTraceError as exc:
            details = exc.details or ReaderTraceFailureDetails(
                http_status=None,
                server_error_code=None,
                event_count=event_count,
                batch_bytes=batch_bytes,
            )
            merged = ReaderTraceFailureDetails(
                http_status=details.http_status,
                server_error_code=details.server_error_code,
                event_count=event_count,
                batch_bytes=batch_bytes,
                batch_index=details.batch_index,
                batch_total=details.batch_total,
                events_persisted_before_failure=details.events_persisted_before_failure,
            )
            _log_trace_ingest_failure(attempt_id=attempt_id, details=merged)
            if exc.details is None:
                raise ReaderTraceError(_format_failure_message(merged), details=merged) from exc
            raise
        results = parsed.get("results")
        if not isinstance(results, list):
            details = ReaderTraceFailureDetails(
                http_status=200,
                server_error_code="MALFORMED_RESPONSE",
                event_count=event_count,
                batch_bytes=batch_bytes,
            )
            _log_trace_ingest_failure(attempt_id=attempt_id, details=details)
            raise ReaderTraceError(_format_failure_message(details), details=details)
        if len(results) != event_count:
            details = ReaderTraceFailureDetails(
                http_status=200,
                server_error_code="RESULT_COUNT_MISMATCH",
                event_count=event_count,
                batch_bytes=batch_bytes,
            )
            _log_trace_ingest_failure(attempt_id=attempt_id, details=details)
            raise ReaderTraceError(_format_failure_message(details), details=details)
        return parsed
