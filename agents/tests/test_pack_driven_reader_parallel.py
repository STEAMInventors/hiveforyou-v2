from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from hive_agents.pack_driven_reader.resolve_proposal_pack import ResolvedProposalDomainPack
from hive_agents.pack_driven_reader.run import PackDrivenRunCorrelation, run_pack_driven_reader
from hive_agents.reader import DocumentPage, PageWord, ReaderVerifyContext
from hive_agents.settings import Settings


def _test_correlation() -> PackDrivenRunCorrelation:
    return PackDrivenRunCorrelation(
        study_run_id="study-run-1",
        attempt_id="attempt-1",
        case_id="case-1",
        user_id="user-1",
        domain_id="iep",
        model_provider="anthropic",
        model_id="claude-test",
    )


def _engine1_context(*source_ids: str) -> str:
    return json.dumps(
        {
            "provenance": "test_only_minimal",
            "resolvedDomainId": "iep",
            "domainPackId": "hive.domain.iep",
            "domainPackVersion": "0.0.0-scaffold",
            "logicalDocuments": [
                {
                    "sourceDocumentId": source_id,
                    "filename": f"{index}.pdf",
                    "pageCount": 1,
                    "documentType": "iep.plan",
                }
                for index, source_id in enumerate(source_ids, start=1)
            ],
        }
    )


def _page(source_document_id: str) -> DocumentPage:
    return DocumentPage(
        documentId=source_document_id,
        pageNumber=1,
        words=[PageWord(seq=0, text="Student: Maya Carter")],
    )


def _fake_resolved_pack() -> ResolvedProposalDomainPack:
    return ResolvedProposalDomainPack(
        pack={"schemaVersion": "pack/0", "manifest": {"id": "iep", "version": "0.3.0-proposed"}},
        path=Path("/tmp/fake-pack.json"),
        content_sha256="a" * 64,
        source="override",
    )


def test_pack_driven_fan_in_preserves_document_order(monkeypatch: pytest.MonkeyPatch) -> None:
    ids = ["doc-b", "doc-a", "doc-c"]
    completion_order: list[str] = []

    def fake_process(**kwargs: object) -> object:
        from hive_agents.pack_driven_reader.run import PackDrivenDocumentResult

        source_document_id = str(kwargs["source_document_id"])
        completion_order.append(source_document_id)
        return PackDrivenDocumentResult(
            source_document_id=source_document_id,
            document_type_id="iep.plan",
            engine1_document_type_id="iep.plan",
            classification_needs_review=False,
            parse_ok=True,
            parse_errors=[],
        )

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.resolve_and_load_proposal_domain_pack",
        lambda **_kwargs: _fake_resolved_pack(),
    )
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run._process_single_document",
        fake_process,
    )

    _result, per_document, _audit, _extractions = run_pack_driven_reader(
        pages=[_page(doc_id) for doc_id in ids],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=_engine1_context(*ids),
        settings=Settings(reader_parallel_concurrency=3),
        correlation=_test_correlation(),
    )

    assert [row.source_document_id for row in per_document] == ids
    assert set(completion_order) == set(ids)


def test_pack_driven_reports_failed_document_tasks(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_process(**kwargs: object) -> object:
        from hive_agents.pack_driven_reader.run import PackDrivenDocumentResult

        source_document_id = str(kwargs["source_document_id"])
        if source_document_id == "doc-fail":
            raise RuntimeError("model_unavailable")
        return PackDrivenDocumentResult(
            source_document_id=source_document_id,
            document_type_id="iep.plan",
            engine1_document_type_id="iep.plan",
            classification_needs_review=False,
            parse_ok=True,
            parse_errors=[],
        )

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.resolve_and_load_proposal_domain_pack",
        lambda **_kwargs: _fake_resolved_pack(),
    )
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run._process_single_document",
        fake_process,
    )

    _result, per_document, _audit, extractions = run_pack_driven_reader(
        pages=[_page("doc-ok"), _page("doc-fail")],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=_engine1_context("doc-ok", "doc-fail"),
        settings=Settings(reader_parallel_concurrency=2),
        correlation=_test_correlation(),
    )
    assert len(extractions) == 1

    failed = next(row for row in per_document if row.source_document_id == "doc-fail")
    assert failed.execution_error == "RuntimeError"
    assert failed.parse_ok is False
    assert len(per_document) == 2


def test_pack_driven_bounded_parallelism(monkeypatch: pytest.MonkeyPatch) -> None:
    import threading
    import time

    peak = 0
    in_flight = 0
    lock = threading.Lock()

    def fake_process(**kwargs: object) -> object:
        nonlocal peak, in_flight
        from hive_agents.pack_driven_reader.run import PackDrivenDocumentResult

        with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        time.sleep(0.05)
        with lock:
            in_flight -= 1
        return PackDrivenDocumentResult(
            source_document_id=str(kwargs["source_document_id"]),
            document_type_id="iep.plan",
            engine1_document_type_id="iep.plan",
            classification_needs_review=False,
            parse_ok=True,
            parse_errors=[],
        )

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.resolve_and_load_proposal_domain_pack",
        lambda **_kwargs: _fake_resolved_pack(),
    )
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run._process_single_document",
        fake_process,
    )

    ids = [f"doc-{index}" for index in range(4)]
    _result, _per_document, audit, _extractions = run_pack_driven_reader(
        pages=[_page(doc_id) for doc_id in ids],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=_engine1_context(*ids),
        settings=Settings(reader_parallel_concurrency=2),
        correlation=_test_correlation(),
    )

    assert peak <= 2
    assert audit["parallelConcurrency"] == 2


def test_wrong_engine1_classification_does_not_block_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    compile_calls: list[dict[str, object]] = []
    extract_calls: list[dict[str, object]] = []

    def fake_compile(**kwargs: object) -> object:
        from hive_agents.pack_driven_reader.compiler_bridge import PackDrivenReaderCompileResult

        compile_calls.append(dict(kwargs))
        return PackDrivenReaderCompileResult(
            prompt_version="hive-pack-driven-reader/0.2.0",
            pack_id="iep",
            pack_version="0.3.0-proposed",
            pack_content_sha256="abc",
            pack_document_type_count=10,
            pack_record_type_count=20,
            stable_system_prefix="stable",
            case_user_content="user",
            output_json_schema={},
            blocks={},
        )

    def fake_extract(**kwargs: object) -> object:
        from hive_agents.pack_driven_reader.lm_extract import PackDrivenExtractionCallResult

        extract_calls.append(dict(kwargs))
        return PackDrivenExtractionCallResult(
            assistant_text=json.dumps(
                {
                    "documentTypeId": "iep.referral",
                    "sourceDocumentId": "doc-a",
                    "recordInstances": [],
                }
            ),
            parsed_model_json={
                "documentTypeId": "iep.referral",
                "sourceDocumentId": "doc-a",
                "recordInstances": [],
            },
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    def fake_parse(**kwargs: object) -> object:
        from hive_agents.pack_driven_reader.compiler_bridge import PackDrivenReaderParseResult

        _ = kwargs
        return PackDrivenReaderParseResult(
            ok=True,
            needs_review=False,
            document_type_id="iep.referral",
            document_type_resolved="classified",
            errors=[],
            record_instances=[],
        )

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.resolve_and_load_proposal_domain_pack",
        lambda **_kwargs: ResolvedProposalDomainPack(
            pack={"schemaVersion": "pack/0", "documentTypes": [], "recordTypes": []},
            path=Path("/tmp/fake-pack.json"),
            content_sha256="a" * 64,
            source="override",
        ),
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt", fake_compile)
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.compiler_bridge.parse_pack_driven_extraction_via_node",
        fake_parse,
    )

    context = json.dumps(
        {
            "provenance": "persisted_discover_structure_map",
            "resolvedDomainId": "iep",
            "domainPackId": "hive.domain.iep",
            "domainPackVersion": "0.0.0-scaffold",
            "logicalDocuments": [
                {
                    "sourceDocumentId": "doc-a",
                    "filename": "doc.pdf",
                    "pageCount": 1,
                    "documentTypeId": "iep.plan",
                }
            ],
        }
    )

    page = DocumentPage(documentId="doc-a", pageNumber=1, words=[PageWord(seq=0, text="Referral text")])
    _result, per_document, audit, extractions = run_pack_driven_reader(
        pages=[page],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=context,
        settings=Settings(),
        correlation=_test_correlation(),
    )
    assert extractions[0]["status"] == "SUCCEEDED"
    assert extractions[0]["parsedModelJson"]["documentTypeId"] == "iep.referral"

    assert len(compile_calls) == 1
    assert len(extract_calls) == 1
    assert "document_type_id" not in compile_calls[0]
    assert per_document[0].document_type_id == "iep.referral"
    assert per_document[0].engine1_document_type_id == "iep.plan"


def test_successful_and_failed_sibling_documents_both_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw_model = {"documentTypeId": "iep.plan", "recordInstances": []}
    raw_ok = json.dumps(raw_model)

    class FakeCompiled:
        prompt_version = "hive-pack-driven-reader/test"
        pack_content_sha256 = "b" * 64

    def fake_compile(**kwargs: object) -> FakeCompiled:
        _ = kwargs
        return FakeCompiled()

    def fake_extract(**_kwargs: object) -> object:
        from hive_agents.pack_driven_reader.lm_extract import PackDrivenExtractionCallResult

        return PackDrivenExtractionCallResult(
            assistant_text=raw_ok,
            parsed_model_json=dict(raw_model),
            usage={},
        )

    def fake_parse(**_kwargs: object) -> object:
        from hive_agents.pack_driven_reader.compiler_bridge import PackDrivenReaderParseResult

        return PackDrivenReaderParseResult(
            ok=True,
            needs_review=False,
            document_type_id="iep.plan",
            document_type_resolved="classified",
            errors=[],
            record_instances=[],
        )

    import hive_agents.pack_driven_reader.run as run_module

    original_process = run_module._process_single_document

    def fake_process(**kwargs: object) -> object:
        source_document_id = str(kwargs["source_document_id"])
        if source_document_id == "doc-bad":
            from hive_agents.pack_driven_reader.document_extraction_envelope import (
                build_reader_document_extraction_envelope,
            )
            from hive_agents.pack_driven_reader.run import PackDrivenDocumentResult

            correlation = _test_correlation()
            envelope = build_reader_document_extraction_envelope(
                study_run_id=correlation.study_run_id,
                attempt_id=correlation.attempt_id,
                case_id=correlation.case_id,
                user_id=correlation.user_id,
                source_document_id="doc-bad",
                domain_id="iep",
                pack={"manifest": {"id": "iep", "version": "0.3"}},
                pack_content_sha256="c" * 64,
                prompt_version="test",
                model_provider="anthropic",
                model_id="claude-test",
                status="INVALID_JSON",
                raw_assistant_text="<<broken>>",
                parsed_model_json=None,
                usage={},
                latency_ms=1,
                error_code="INVALID_JSON",
                error_message="bad json",
            )
            return PackDrivenDocumentResult(
                source_document_id="doc-bad",
                document_type_id=None,
                engine1_document_type_id="iep.plan",
                classification_needs_review=False,
                parse_ok=False,
                parse_errors=["invalid_json_response"],
                document_extraction_envelope=envelope,
            )
        return original_process(**kwargs)

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.resolve_and_load_proposal_domain_pack",
        lambda **_kwargs: _fake_resolved_pack(),
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt", fake_compile)
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.compiler_bridge.parse_pack_driven_extraction_via_node",
        fake_parse,
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run._process_single_document", fake_process)

    _result, per_document, _audit, extractions = run_pack_driven_reader(
        pages=[_page("doc-ok"), _page("doc-bad")],
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
        engine1_reader_context_json=_engine1_context("doc-ok", "doc-bad"),
        settings=Settings(reader_parallel_concurrency=2),
        correlation=_test_correlation(),
    )

    by_id = {row.source_document_id: row for row in per_document}
    assert by_id["doc-ok"].parse_ok is True
    assert by_id["doc-bad"].parse_ok is False
    assert len(extractions) == 2
    statuses = {env["sourceDocumentId"]: env["status"] for env in extractions}
    assert statuses["doc-ok"] == "SUCCEEDED"
    assert statuses["doc-bad"] == "INVALID_JSON"
