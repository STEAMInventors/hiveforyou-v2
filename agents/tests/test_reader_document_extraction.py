from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from hive_agents.pack_driven_reader.compiler_bridge import PackDrivenReaderCompileResult
from hive_agents.pack_driven_reader.lm_extract import PackDrivenExtractionCallResult
from hive_agents.pack_driven_reader.run import PackDrivenRunCorrelation, _process_single_document
from hive_agents.reader import DocumentPage, PageWord, ReaderVerifyContext


def _correlation() -> PackDrivenRunCorrelation:
    return PackDrivenRunCorrelation(
        study_run_id="study-1",
        attempt_id="attempt-1",
        case_id="case-1",
        user_id="user-1",
        domain_id="iep",
        model_provider="anthropic",
        model_id="claude-test",
    )


def _compiled() -> PackDrivenReaderCompileResult:
    return PackDrivenReaderCompileResult(
        prompt_version="hive-pack-driven-reader/0.2.0",
        pack_id="iep",
        pack_version="0.3.0-proposed",
        pack_content_sha256="a" * 64,
        pack_document_type_count=1,
        pack_record_type_count=1,
        stable_system_prefix="stable",
        case_user_content="user",
        output_json_schema={},
        blocks={},
    )


def _page() -> DocumentPage:
    return DocumentPage(documentId="doc-a", pageNumber=1, words=[PageWord(seq=0, text="Student name")])


def test_process_single_document_preserves_raw_fields_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    model_json = {
        "documentTypeId": "iep.plan",
        "sourceDocumentId": "doc-a",
        "recordInstances": [
            {
                "recordTypeId": "goal",
                "fields": {
                    "goalText": {
                        "value": "Read fluently",
                        "evidence": {"sourceDocumentId": "doc-a", "page": 1, "quote": "Read fluently"},
                    }
                },
            }
        ],
    }

    def fake_extract(**_kwargs: object) -> PackDrivenExtractionCallResult:
        return PackDrivenExtractionCallResult(
            assistant_text=json.dumps(model_json),
            parsed_model_json=model_json,
            usage={"input_tokens": 10, "output_tokens": 20},
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

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt",
        lambda **_kwargs: _compiled(),
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)
    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.compiler_bridge.parse_pack_driven_extraction_via_node",
        fake_parse,
    )

    result = _process_single_document(
        source_document_id="doc-a",
        doc_pages=[_page()],
        proposal_pack={"manifest": {"id": "iep", "version": "0.3.0-proposed"}},
        case_manifest=[],
        engine1_document_type_id="iep.plan",
        correlation=_correlation(),
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
    )

    envelope = result.document_extraction_envelope
    assert envelope is not None
    assert envelope["status"] == "SUCCEEDED"
    assert envelope["rawAssistantText"] == json.dumps(model_json)
    assert envelope["parsedModelJson"] == model_json
    assert envelope["parsedModelJson"]["recordInstances"][0]["fields"]["goalText"]["evidence"]["quote"] == "Read fluently"


def test_process_single_document_invalid_json_preserves_text(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_extract(**_kwargs: object) -> PackDrivenExtractionCallResult:
        return PackDrivenExtractionCallResult(
            assistant_text="<<not json>>",
            parsed_model_json=None,
            usage={"input_tokens": 1, "output_tokens": 1},
        )

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt",
        lambda **_kwargs: _compiled(),
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)

    result = _process_single_document(
        source_document_id="doc-a",
        doc_pages=[_page()],
        proposal_pack={"manifest": {"id": "iep", "version": "0.3.0-proposed"}},
        case_manifest=[],
        engine1_document_type_id="iep.plan",
        correlation=_correlation(),
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
    )

    envelope = result.document_extraction_envelope
    assert envelope is not None
    assert envelope["status"] == "INVALID_JSON"
    assert envelope["rawAssistantText"] == "<<not json>>"
    assert "parsedModelJson" not in envelope


def test_process_single_document_model_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_extract(**_kwargs: object) -> PackDrivenExtractionCallResult:
        raise TimeoutError("model timeout")

    monkeypatch.setattr(
        "hive_agents.pack_driven_reader.run.compile_pack_driven_reader_prompt",
        lambda **_kwargs: _compiled(),
    )
    monkeypatch.setattr("hive_agents.pack_driven_reader.run.call_pack_driven_extraction", fake_extract)

    result = _process_single_document(
        source_document_id="doc-a",
        doc_pages=[_page()],
        proposal_pack={"manifest": {"id": "iep", "version": "0.3.0-proposed"}},
        case_manifest=[],
        engine1_document_type_id="iep.plan",
        correlation=_correlation(),
        lm=MagicMock(),
        verifier_client=MagicMock(),
        verify_context=ReaderVerifyContext(case_id="case-1", user_id="user-1"),
    )

    envelope = result.document_extraction_envelope
    assert envelope is not None
    assert envelope["status"] == "MODEL_ERROR"
    assert envelope["sanitizedError"]["code"] == "TimeoutError"
    assert envelope["studyRunId"] == "study-1"
    assert envelope["attemptId"] == "attempt-1"
    assert envelope["sourceDocumentId"] == "doc-a"
