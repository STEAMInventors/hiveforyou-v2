from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WriterModelDiagnostics:
    stop_reason: str | None
    output_tokens: int | None
    output_characters: int | None
    configured_max_output_tokens: int | None

    def as_safe_dict(self) -> dict[str, int | str | None]:
        return {
            "stopReason": self.stop_reason,
            "outputTokens": self.output_tokens,
            "outputCharacters": self.output_characters,
            "configuredMaxOutputTokens": self.configured_max_output_tokens,
        }


class WriterModelError(ValueError):
    """Writer model boundary failure with a stable error code (no raw model text)."""

    def __init__(
        self,
        code: str,
        *,
        message: str | None = None,
        diagnostics: WriterModelDiagnostics | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.diagnostics = diagnostics
        self.http_status = http_status


def classify_json_parse_failure(*, text: str, diagnostics: WriterModelDiagnostics) -> WriterModelError:
    stripped = text.strip()
    if not stripped:
        return WriterModelError("WRITER_MODEL_OUTPUT_EMPTY", diagnostics=diagnostics)
    if diagnostics.stop_reason == "max_tokens":
        return WriterModelError("WRITER_MODEL_OUTPUT_TRUNCATED", diagnostics=diagnostics)
    if stripped.startswith("{") or stripped.startswith("["):
        return WriterModelError("WRITER_MODEL_JSON_MALFORMED", diagnostics=diagnostics)
    return WriterModelError("WRITER_MODEL_JSON_INVALID", diagnostics=diagnostics)


def map_provider_exception(exc: BaseException, *, diagnostics: WriterModelDiagnostics) -> WriterModelError:
    from dspy.utils.exceptions import LMError

    if isinstance(exc, WriterModelError):
        return exc

    message = str(exc)
    upper = message.upper()
    if "UNSUPPORTED" in upper and "RESPONSE_FORMAT" in upper:
        return WriterModelError("WRITER_PROVIDER_SCHEMA_UNSUPPORTED", diagnostics=diagnostics)
    if isinstance(exc, LMError):
        status = getattr(exc, "status", None)
        if status is not None and int(status) >= 500:
            return WriterModelError(
                "WRITER_PROVIDER_HTTP_5XX",
                diagnostics=diagnostics,
                http_status=int(status),
            )
        if status is not None and int(status) >= 400:
            return WriterModelError(
                "WRITER_PROVIDER_HTTP_4XX",
                diagnostics=diagnostics,
                http_status=int(status),
            )
    if "timeout" in message.lower():
        return WriterModelError("WRITER_PROVIDER_HTTP_TIMEOUT", diagnostics=diagnostics)
    return WriterModelError("WRITER_PROVIDER_CALL_FAILED", diagnostics=diagnostics)


def extract_stop_reason(response: Any) -> str | None:
    if response is None:
        return None
    if isinstance(response, dict):
        for key in ("stop_reason", "stopReason", "finish_reason", "finishReason"):
            value = response.get(key)
            if isinstance(value, str) and value:
                return value
        return None
    for key in ("stop_reason", "stopReason", "finish_reason", "finishReason"):
        value = getattr(response, key, None)
        if isinstance(value, str) and value:
            return value
    return None