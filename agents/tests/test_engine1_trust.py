from __future__ import annotations

import json

import pytest

from hive_agents.engine1_trust import (
    Engine1ReaderContextError,
    validate_engine1_reader_context_json,
)
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta


def _context(**overrides: object) -> str:
    payload = {
        "provenance": "test_only_minimal",
        "resolvedDomainId": "iep",
        "domainPackId": "iep-pack",
        "domainPackVersion": "1.0.0",
        "logicalDocuments": [
            {"sourceDocumentId": "doc-a", "pageCount": 2, "filename": "a.pdf"},
            {"sourceDocumentId": "doc-b", "pageCount": 1},
        ],
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_validate_engine1_context_accepts_matching_inventory() -> None:
    trusted = [
        TrustedDocumentMeta("doc-a", filename="a.pdf", page_count=2),
        TrustedDocumentMeta("doc-b", page_count=1),
    ]
    validated = validate_engine1_reader_context_json(
        _context(),
        domain_id="iep",
        domain_pack_id="iep-pack",
        domain_pack_version="1.0.0",
        trusted_documents=trusted,
    )
    assert validated.logical_document_ids == ("doc-a", "doc-b")


def test_validate_engine1_context_rejects_domain_mismatch() -> None:
    with pytest.raises(Engine1ReaderContextError) as exc:
        validate_engine1_reader_context_json(
            _context(resolvedDomainId="medicaid"),
            domain_id="iep",
            domain_pack_id="iep-pack",
            domain_pack_version="1.0.0",
            trusted_documents=[TrustedDocumentMeta("doc-a", page_count=2), TrustedDocumentMeta("doc-b", page_count=1)],
        )
    assert exc.value.code == "ENGINE1_CONTEXT_MISMATCH"


def test_validate_engine1_context_rejects_extra_logical_document() -> None:
    with pytest.raises(Engine1ReaderContextError) as exc:
        validate_engine1_reader_context_json(
            _context(
                logicalDocuments=[
                    {"sourceDocumentId": "doc-a", "pageCount": 2},
                    {"sourceDocumentId": "doc-b", "pageCount": 1},
                    {"sourceDocumentId": "doc-c", "pageCount": 1},
                ]
            ),
            domain_id="iep",
            domain_pack_id="iep-pack",
            domain_pack_version="1.0.0",
            trusted_documents=[
                TrustedDocumentMeta("doc-a", page_count=2),
                TrustedDocumentMeta("doc-b", page_count=1),
            ],
        )
    assert exc.value.code == "ENGINE1_CONTEXT_MISMATCH"
