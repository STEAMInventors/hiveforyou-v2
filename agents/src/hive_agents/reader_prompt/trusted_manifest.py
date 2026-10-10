from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TrustedDocumentMeta:
    source_document_id: str
    filename: str | None = None
    document_type: str | None = None
    page_count: int | None = None


def format_trusted_manifest_block(documents: list[TrustedDocumentMeta]) -> str:
    """Trusted metadata for §3 case user delimiters (no page text)."""
    lines = ["--- TRUSTED_LOGICAL_DOCUMENT_MANIFEST (metadata only) ---"]
    for doc in sorted(documents, key=lambda d: d.source_document_id):
        parts = [f"sourceDocumentId={doc.source_document_id}"]
        if doc.filename:
            parts.append(f"filename={doc.filename}")
        if doc.document_type:
            parts.append(f"documentType={doc.document_type}")
        if doc.page_count is not None:
            parts.append(f"pageCount={doc.page_count}")
        lines.append("- " + " ".join(parts))
    lines.append("--- END TRUSTED_LOGICAL_DOCUMENT_MANIFEST ---")
    return "\n".join(lines)
