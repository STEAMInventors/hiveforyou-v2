from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class LogicalDocumentMeta:
    source_document_id: str
    document_type_id: str | None
    discover_document_type_label: str | None
    filename: str | None
    page_count: int | None


def _normalize_discover_label(label: str) -> str:
    return " ".join(label.strip().lower().split())


def _labels_for_document_type(doc: Mapping[str, Any]) -> set[str]:
    labels: set[str] = set()
    primary = doc.get("label")
    if isinstance(primary, str) and primary.strip():
        labels.add(_normalize_discover_label(primary))
    for alias in doc.get("discoverLabels") or []:
        if isinstance(alias, str) and alias.strip():
            labels.add(_normalize_discover_label(alias))
    doc_id = doc.get("id")
    if isinstance(doc_id, str) and doc_id.strip():
        labels.add(_normalize_discover_label(doc_id))
    return labels


def resolve_discover_document_type_id(
    pack: Mapping[str, Any],
    discover_label: str | None,
) -> str | None:
    if not isinstance(discover_label, str) or not discover_label.strip():
        return None
    normalized = _normalize_discover_label(discover_label)
    document_types = pack.get("documentTypes")
    if not isinstance(document_types, list):
        return None

    direct = [row for row in document_types if isinstance(row, dict) and row.get("id") == discover_label.strip()]
    if len(direct) == 1:
        return str(direct[0]["id"])

    matches: list[str] = []
    for row in document_types:
        if not isinstance(row, dict):
            continue
        doc_id = row.get("id")
        if not isinstance(doc_id, str) or not doc_id.strip():
            continue
        if normalized in _labels_for_document_type(row):
            matches.append(doc_id.strip())
    if len(matches) == 1:
        return matches[0]
    return None


def parse_engine1_logical_documents(raw: str) -> tuple[list[LogicalDocumentMeta], list[str]]:
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Engine 1 context must be a JSON object.")
    logical = parsed.get("logicalDocuments")
    if not isinstance(logical, list) or not logical:
        raise ValueError("logicalDocuments must be a non-empty array.")
    docs: list[LogicalDocumentMeta] = []
    order: list[str] = []
    for index, item in enumerate(logical):
        if not isinstance(item, dict):
            raise ValueError(f"logicalDocuments[{index}] must be an object.")
        source_id = item.get("sourceDocumentId")
        if not isinstance(source_id, str) or not source_id.strip():
            raise ValueError(f"logicalDocuments[{index}].sourceDocumentId required.")
        normalized = source_id.strip()
        discover_label_raw = item.get("discoverDocumentTypeLabel")
        discover_label = (
            discover_label_raw.strip()
            if isinstance(discover_label_raw, str) and discover_label_raw.strip()
            else None
        )
        document_type_id_raw = item.get("documentTypeId")
        document_type_id = (
            document_type_id_raw.strip()
            if isinstance(document_type_id_raw, str) and document_type_id_raw.strip()
            else None
        )
        if document_type_id is None:
            document_type = item.get("documentType")
            legacy = document_type.strip() if isinstance(document_type, str) and document_type.strip() else None
            document_type_id = legacy
            if discover_label is None:
                discover_label = legacy
        if discover_label is None and document_type_id is not None:
            discover_label = document_type_id
        filename = item.get("filename")
        filename_value = filename.strip() if isinstance(filename, str) and filename.strip() else None
        page_count = item.get("pageCount")
        page_count_value = page_count if isinstance(page_count, int) and page_count > 0 else None
        docs.append(
            LogicalDocumentMeta(
                source_document_id=normalized,
                document_type_id=document_type_id,
                discover_document_type_label=discover_label,
                filename=filename_value,
                page_count=page_count_value,
            )
        )
        order.append(normalized)
    return docs, order


def build_case_manifest(
    logical_docs: list[LogicalDocumentMeta],
    *,
    pack: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for doc in logical_docs:
        discover_document_type_id = (
            resolve_discover_document_type_id(pack, doc.discover_document_type_label)
            if pack is not None
            else None
        )
        if discover_document_type_id is None and doc.document_type_id:
            discover_document_type_id = resolve_discover_document_type_id(pack, doc.document_type_id)
        manifest.append(
            {
                "sourceDocumentId": doc.source_document_id,
                "filename": doc.filename,
                "pageCount": doc.page_count,
                "discoverDocumentTypeLabel": doc.discover_document_type_label,
                "discoverDocumentTypeId": discover_document_type_id,
            }
        )
    return manifest
