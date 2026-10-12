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

    def fake_run_pack_driven_reader(**kwargs: object) -> tuple[ReaderRunResult, list, dict, list]:
        captured.update(kwargs)
        return (
            ReaderRunResult(candidate_facts=[], accepted_candidate_facts=[]),
            [],
            {"readerMode": "pack_driven"},
            [],
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

    result, audit, per_document, _document_extractions = execute_study_reader(request)
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

    def fake_pack_driven(**_kwargs: object) -> tuple[ReaderRunResult, list, dict, list]:
        called["pack_driven"] = True
        return ReaderRunResult(), [], {}, []

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


def test_parser_exception_preserves_raw_assistant_text(monkeypatch: pytest.MonkeyPatch) -> None:
    from hive_agents.pack_driven_reader.run import PackDrivenRunCorrelation, run_pack_driven_reader
    from hive_agents.reader import PageWord, ReaderVerifyContext
    from hive_agents.settings import Settings

    raw_model = {"documentTypeId": "iep.plan", "recordInstances": []}
    raw_text = json.dumps(raw_model)

    class FakeCompiled:
        prompt_version = "hive-pack-driven-reader/test"
        pack_content_sha256 = "a" * 64

    def fake_compile(**_kwargs: object) -> FakeCompiled:
        return FakeCompiled()

    def fake_extract(**_kwargs: object) -> object:
        from hive_agents.pack_driven_reader.lm_extract import PackDrivenExtractionCallResult

        return PackDrivenExtractionCallResult(
            assistant_text=raw_text,
            parsed_model_json=dict(raw_model),
            usage={"input_tokens": 10, "output_tokens": 20},
        )

    def fake_parse(**_kwargs: object) -> object:
        raise ValueError("parser_exploded")

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.load_proposal_domain_pack",
        lambda _path: {"schemaVersion": "pack/0", "manifest": {"id": "iep", "version": "0.3"}},
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt", fake_compile)
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.compiler_bridge.parse_pack_driven_extraction_via_node",
        fake_parse,
    )

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
    correlation = PackDrivenRunCorrelation(
        study_run_id="study-run-1",
        attempt_id="attempt-1",
        case_id="case-1",
        user_id="user-1",
        domain_id="iep",
        model_provider="anthropic",
        model_id="claude-test",
    )
    page = DocumentPage(
        documentId="doc-a",
        pageNumber=1,
        words=[PageWord(seq=0, text="Student: Maya Carter")],
    )

    _result, per_document, _audit, extractions = run_pack_driven_reader(
        pages=[page],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=json.dumps(engine1),
        settings=Settings(),
        correlation=correlation,
    )

    row = per_document[0]
    assert row.parse_ok is False
    assert row.execution_error == "ValueError"
    assert extractions[0]["status"] == "SUCCEEDED"
    assert extractions[0]["rawAssistantText"] == raw_text


def test_trace_flush_failure_returns_envelopes_and_failed_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from hive_agents.trace_client import ReaderTraceError, ReaderTraceFailureDetails

    monkeypatch.setenv("HIVE_READER_MODE", "pack_driven")
    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "0")
    monkeypatch.setenv("HIVE_AGENTS_SERVICE_TOKEN", "token")
    monkeypatch.setenv("HIVE_VERIFIER_TOKEN", "verifier")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()

    sample_envelope = {
        "schemaVersion": "hive.reader-document-extraction/1",
        "studyRunId": "run-1",
        "attemptId": "attempt-1",
        "sourceDocumentId": "doc-a",
        "status": "SUCCEEDED",
        "rawAssistantText": '{"documentTypeId":"iep.plan"}',
    }

    def fake_run_pack_driven_reader(**_kwargs: object) -> tuple[ReaderRunResult, list, dict, list]:
        return (
            ReaderRunResult(candidate_facts=[], accepted_candidate_facts=[]),
            [],
            {"readerMode": "pack_driven"},
            [sample_envelope],
        )

    class FakeContext:
        model_id = "claude-test"

    class FakeSession:
        context = FakeContext()

        def emit(self, _event_type: str, _payload: object | None = None) -> None:
            return None

        def flush(self) -> None:
            raise ReaderTraceError(
                "trace ingest failed",
                details=ReaderTraceFailureDetails(
                    http_status=503,
                    server_error_code="TRACE_PERSIST_FAILED",
                    event_count=2,
                    batch_bytes=128,
                ),
            )

    monkeypatch.setattr("hive_agents.app.run_pack_driven_reader", fake_run_pack_driven_reader)
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app._require_verifier_client", lambda: MagicMock())
    monkeypatch.setattr("hive_agents.app._build_trace_session", lambda *_args, **_kwargs: FakeSession())

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
                    "pages": [{"pageNumber": 1, "words": [{"seq": 0, "text": "x"}]}],
                }
            ],
        }
    )

    _result, audit, _per_document, document_extractions = execute_study_reader(request)
    assert audit.persisted is False
    assert audit.status == "failed"
    assert audit.error_code == "TRACE_PERSIST_FAILED"
    assert document_extractions == [sample_envelope]
