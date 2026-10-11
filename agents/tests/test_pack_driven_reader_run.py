from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from hive_agents.api_models import StudyReaderRequest
from hive_agents.app import execute_study_reader
from hive_agents.pack_driven_reader.map_to_candidate import pack_extraction_to_candidate_facts
from hive_agents.reader import DocumentPage, PageWord, ReaderRunResult
from hive_agents.settings import get_settings


def test_pack_extraction_to_candidate_facts_skips_missing() -> None:
    candidates = pack_extraction_to_candidate_facts(
        source_document_id="doc-a",
        record_instances=[
            {
                "recordTypeId": "student",
                "instanceIndex": 0,
                "fields": [
                    {
                        "fieldId": "name",
                        "valueKind": "text",
                        "value": "Maya Carter",
                        "modality": "observed",
                        "missingState": None,
                        "evidence": {
                            "sourceDocumentId": "doc-a",
                            "page": 1,
                            "quote": "Student: Maya Carter",
                        },
                    },
                    {
                        "fieldId": "grade",
                        "valueKind": "code",
                        "value": "2",
                        "modality": "observed",
                        "missingState": "not_found_in_supplied_documents",
                        "evidence": None,
                    },
                ],
            }
        ],
    )
    assert len(candidates) == 1
    assert candidates[0].construct.measure == "student.name"


def test_execute_study_reader_pack_driven_branch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HIVE_READER_MODE", raising=False)
    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "1")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()

    captured: dict[str, object] = {}

    def fake_run_pack_driven_reader(**kwargs: object) -> tuple[ReaderRunResult, list, dict]:
        captured.update(kwargs)
        return (
            ReaderRunResult(candidate_facts=[], accepted_candidate_facts=[]),
            [],
            {"readerMode": "pack_driven"},
        )

    monkeypatch.setattr("hive_agents.app.run_pack_driven_reader", fake_run_pack_driven_reader)
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app._require_verifier_client", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)

    engine1 = {
        "provenance": "test_only_minimal",
        "resolvedDomainId": "iep",
        "domainPackId": "hive.domain.iep",
        "domainPackVersion": "0.0.0-scaffold",
        "logicalDocuments": [
            {
                "sourceDocumentId": "doc-a",
                "filename": "plan.pdf",
                "pageCount": 1,
                "documentType": "iep.plan",
            }
        ],
    }
    request = StudyReaderRequest.model_validate(
        {
            "caseId": "case-1",
            "userId": "user-1",
            "domainId": "iep",
            "studyRunId": "run-1",
            "attemptId": "attempt-1",
            "readerMode": "pack_driven",
            "engine1ReaderContextJson": json.dumps(engine1),
            "documents": [
                {
                    "sourceDocumentId": "doc-a",
                    "pages": [
                        {
                            "pageNumber": 1,
                            "words": [{"seq": 0, "text": "Student: Maya Carter"}],
                        }
                    ],
                }
            ],
        }
    )

    result, audit, per_document = execute_study_reader(request)
    assert result.candidate_facts == []
    assert audit.persisted is False
    assert per_document == []
    assert captured.get("engine1_reader_context_json") == request.engine1_reader_context_json


def test_legacy_reader_unchanged_when_reader_mode_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HIVE_READER_MODE", raising=False)
    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "1")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()

    called = {"pack_driven": False, "legacy": False}

    def fake_pack_driven(**_kwargs: object) -> tuple[ReaderRunResult, list, dict]:
        called["pack_driven"] = True
        return ReaderRunResult(), [], {}

    def fake_variant(**_kwargs: object) -> tuple[ReaderRunResult, dict | None]:
        called["legacy"] = True
        return ReaderRunResult(), None

    monkeypatch.setattr("hive_agents.app.run_pack_driven_reader", fake_pack_driven)
    monkeypatch.setattr("hive_agents.app._execute_reader_variant", fake_variant)
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app._require_verifier_client", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)

    request = StudyReaderRequest.model_validate(
        {
            "caseId": "case-1",
            "userId": "user-1",
            "domainId": "iep",
            "studyRunId": "run-1",
            "attemptId": "attempt-1",
            "documents": [
                {
                    "sourceDocumentId": "doc-a",
                    "pages": [{"pageNumber": 1, "words": [{"seq": 0, "text": "x"}]}],
                }
            ],
        }
    )
    execute_study_reader(request)
    assert called["legacy"] is True
    assert called["pack_driven"] is False
