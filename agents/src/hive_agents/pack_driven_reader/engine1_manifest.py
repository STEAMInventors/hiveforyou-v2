from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LogicalDocumentMeta:
    source_document_id: str
    document_type_id: str | None
    filename: str | None
    page_count: int | None


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
        document_type = item.get("documentType")
        document_type_id = document_type.strip() if isinstance(document_type, str) and document_type.strip() else None
        filename = item.get("filename")
        filename_value = filename.strip() if isinstance(filename, str) and filename.strip() else None
        page_count = item.get("pageCount")
        page_count_value = page_count if isinstance(page_count, int) and page_count > 0 else None
        docs.append(
            LogicalDocumentMeta(
                source_document_id=normalized,
                document_type_id=document_type_id,
                filename=filename_value,
                page_count=page_count_value,
            )
        )
        order.append(normalized)
    return docs, order


def build_case_manifest(logical_docs: list[LogicalDocumentMeta]) -> list[dict[str, Any]]:
    return [
        {
            "sourceDocumentId": doc.source_document_id,
            "filename": doc.filename,
            "pageCount": doc.page_count,
            "documentTypeId": doc.document_type_id,
        }
        for doc in logical_docs
    ]
