from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping

READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION = "hive.reader-document-extraction/1"

DocumentExtractionStatus = Literal["SUCCEEDED", "INVALID_JSON", "MODEL_ERROR"]


def _pack_manifest_fields(pack: Mapping[str, Any]) -> tuple[str, str]:
    manifest = pack.get("manifest")
    if isinstance(manifest, dict):
        pack_id = manifest.get("id")
        pack_version = manifest.get("version")
        if isinstance(pack_id, str) and isinstance(pack_version, str):
            return pack_id, pack_version
    return "unknown", "unknown"


def build_reader_document_extraction_envelope(
    *,
    study_run_id: str,
    attempt_id: str,
    case_id: str,
    user_id: str,
    source_document_id: str,
    domain_id: str,
    pack: Mapping[str, Any],
    pack_content_sha256: str | None,
    prompt_version: str | None,
    model_provider: str,
    model_id: str,
    status: DocumentExtractionStatus,
    raw_assistant_text: str | None,
    parsed_model_json: dict[str, Any] | None,
    usage: Mapping[str, int | None] | None,
    latency_ms: int | None,
    occurred_at: str | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    pack_id, pack_version = _pack_manifest_fields(pack)
    envelope: dict[str, Any] = {
        "schemaVersion": READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
        "studyRunId": study_run_id,
        "attemptId": attempt_id,
        "caseId": case_id,
        "userId": user_id,
        "sourceDocumentId": source_document_id,
        "domainId": domain_id,
        "packId": pack_id,
        "packVersion": pack_version,
        "packContentSha256": pack_content_sha256,
        "promptVersion": prompt_version,
        "modelProvider": model_provider,
        "modelId": model_id,
        "status": status,
        "occurredAt": occurred_at
        or datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    if raw_assistant_text is not None:
        envelope["rawAssistantText"] = raw_assistant_text
    if parsed_model_json is not None:
        envelope["parsedModelJson"] = parsed_model_json
    if usage is not None:
        envelope["usage"] = {
            "inputTokens": usage.get("input_tokens"),
            "outputTokens": usage.get("output_tokens"),
            "cacheReadInputTokens": usage.get("cache_read_input_tokens"),
            "cacheWriteInputTokens": usage.get("cache_write_input_tokens"),
        }
    if latency_ms is not None:
        envelope["latencyMs"] = latency_ms
    if error_code is not None or error_message is not None:
        sanitized: dict[str, str] = {}
        if error_code is not None:
            sanitized["code"] = error_code
        if error_message is not None:
            sanitized["message"] = error_message
        envelope["sanitizedError"] = sanitized
    return envelope
