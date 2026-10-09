from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


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


class ReaderTraceError(Exception):
    """Trace ingest unavailable or response could not be trusted."""


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
            if exc.code in (401, 403):
                raise ReaderTraceError("trace authentication failed") from exc
            raise ReaderTraceError("trace HTTP error") from exc
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
        url = f"{self._config.base_url}/internal/agent-run-trace/events"
        parsed = self._transport.post_json(
            url=url,
            token=self._config.token,
            body={"events": events},
            timeout_seconds=self._config.timeout_seconds,
        )
        results = parsed.get("results")
        if not isinstance(results, list):
            raise ReaderTraceError("trace returned malformed response")
        return parsed
