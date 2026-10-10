from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from hive_agents.reader import ReaderError
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta


class Engine1ReaderContextError(ReaderError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class ValidatedEngine1ReaderContext:
    provenance: str
    resolved_domain_id: str
    domain_pack_id: str
    domain_pack_version: str
    logical_document_ids: tuple[str, ...]


_ALLOWED_PROVENANCE = frozenset({"persisted_discover_structure_map", "test_only_minimal"})


def _require_str_field(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            f"Engine 1 reader context field {key!r} must be a non-empty string.",
        )
    return value.strip()


def validate_engine1_reader_context_json(
    raw: str,
    *,
    domain_id: str,
    domain_pack_id: str,
    domain_pack_version: str,
    trusted_documents: list[TrustedDocumentMeta],
) -> ValidatedEngine1ReaderContext:
    """
    Fail closed when worker-supplied Engine 1 context disagrees with authoritative request/pack data.
    """
    stripped = raw.strip()
    if not stripped:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            "Engine 1 reader context JSON must be non-empty when provided.",
        )
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            "Engine 1 reader context is not valid JSON.",
        ) from exc
    if not isinstance(parsed, dict):
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            "Engine 1 reader context must be a JSON object.",
        )

    provenance = _require_str_field(parsed, "provenance")
    if provenance not in _ALLOWED_PROVENANCE:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            f"Unsupported Engine 1 context provenance: {provenance!r}.",
        )

    resolved_domain = _require_str_field(parsed, "resolvedDomainId")
    pack_id = _require_str_field(parsed, "domainPackId")
    pack_version = _require_str_field(parsed, "domainPackVersion")

    expected_domain = domain_id.strip()
    if resolved_domain != expected_domain:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_MISMATCH",
            f"resolvedDomainId {resolved_domain!r} does not match request domainId {expected_domain!r}.",
        )
    if pack_id != domain_pack_id:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_MISMATCH",
            f"domainPackId {pack_id!r} does not match loaded pack {domain_pack_id!r}.",
        )
    if pack_version != domain_pack_version:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_MISMATCH",
            f"domainPackVersion {pack_version!r} does not match loaded pack {domain_pack_version!r}.",
        )

    logical = parsed.get("logicalDocuments")
    if not isinstance(logical, list) or not logical:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            "logicalDocuments must be a non-empty array.",
        )

    meta_by_id = {doc.source_document_id: doc for doc in trusted_documents}
    request_ids = set(meta_by_id.keys())
    if not request_ids:
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_INVALID",
            "Request documents are required to validate Engine 1 context.",
        )

    ordered_ids: list[str] = []
    seen: set[str] = set()
    for index, item in enumerate(logical):
        if not isinstance(item, dict):
            raise Engine1ReaderContextError(
                "ENGINE1_CONTEXT_INVALID",
                f"logicalDocuments[{index}] must be an object.",
            )
        source_id = item.get("sourceDocumentId")
        if not isinstance(source_id, str) or not source_id.strip():
            raise Engine1ReaderContextError(
                "ENGINE1_CONTEXT_INVALID",
                f"logicalDocuments[{index}].sourceDocumentId must be a non-empty string.",
            )
        normalized_id = source_id.strip()
        if normalized_id in seen:
            raise Engine1ReaderContextError(
                "ENGINE1_CONTEXT_INVALID",
                f"Duplicate logicalDocuments sourceDocumentId: {normalized_id!r}.",
            )
        seen.add(normalized_id)
        ordered_ids.append(normalized_id)

        trusted = meta_by_id.get(normalized_id)
        if trusted is None:
            raise Engine1ReaderContextError(
                "ENGINE1_CONTEXT_MISMATCH",
                f"logicalDocuments references unknown sourceDocumentId {normalized_id!r}.",
            )

        filename = item.get("filename")
        if isinstance(filename, str) and filename.strip() and trusted.filename:
            if filename.strip() != trusted.filename.strip():
                raise Engine1ReaderContextError(
                    "ENGINE1_CONTEXT_MISMATCH",
                    f"filename mismatch for {normalized_id!r} in Engine 1 context.",
                )

        page_count = item.get("pageCount")
        if page_count is not None:
            if not isinstance(page_count, int) or page_count <= 0:
                raise Engine1ReaderContextError(
                    "ENGINE1_CONTEXT_INVALID",
                    f"pageCount for {normalized_id!r} must be a positive integer when set.",
                )
            if trusted.page_count is not None and page_count != trusted.page_count:
                raise Engine1ReaderContextError(
                    "ENGINE1_CONTEXT_MISMATCH",
                    f"pageCount mismatch for {normalized_id!r} in Engine 1 context.",
                )

    if seen != request_ids:
        missing = sorted(request_ids - seen)
        extra = sorted(seen - request_ids)
        details: list[str] = []
        if missing:
            details.append(f"missing from logicalDocuments: {missing}")
        if extra:
            details.append(f"unexpected in logicalDocuments: {extra}")
        raise Engine1ReaderContextError(
            "ENGINE1_CONTEXT_MISMATCH",
            "Engine 1 logicalDocuments must match request sourceDocumentId set "
            f"({'; '.join(details)}).",
        )

    return ValidatedEngine1ReaderContext(
        provenance=provenance,
        resolved_domain_id=resolved_domain,
        domain_pack_id=pack_id,
        domain_pack_version=pack_version,
        logical_document_ids=tuple(ordered_ids),
    )
