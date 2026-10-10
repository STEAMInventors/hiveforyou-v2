from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import dspy
import pytest
from fastapi.testclient import TestClient

from hive_agents.app import app, execute_study_reader
from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader import (
    CandidateFact,
    ClaimValue,
    ConstructParts,
    DocumentPage,
    HiveReaderModule,
    InMemoryReaderTools,
    PageWord,
    ReaderError,
    ReaderExecutionLimits,
    ReaderLimitsExhausted,
    ReaderRunResult,
    SourceEvidence,
)
from hive_agents.reader_dedup import DedupStats
from hive_agents.reader_parallel import ParallelExtractionTaskResult, ReaderExperimentTiming
from hive_agents.settings import default_study_agents_json_path, get_settings
from hive_agents.verifier_client import ReaderVerifierClient, ReaderVerifierConfig

IEP_AGENTS_JSON = default_study_agents_json_path(domain_id="iep")


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def api_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HIVE_AGENTS_SERVICE_TOKEN", "service-token-test")
    monkeypatch.setenv("HIVE_VERIFIER_TOKEN", "verifier-token-test")
    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "1")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()


@pytest.fixture
def client(api_env: None) -> TestClient:
    return TestClient(app)


def _auth_headers(token: str = "service-token-test") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _sample_request_body() -> dict[str, Any]:
    return {
        "caseId": "case-l001",
        "userId": "user-internal",
        "domainId": "iep",
        "studyRunId": "33333333-3333-4333-8333-333333333333",
        "attemptId": "55555555-5555-4555-8555-555555555555",
        "documents": [
            {
                "sourceDocumentId": "doc-a",
                "pages": [
                    {
                        "pageNumber": 1,
                        "words": [
                            {"seq": 0, "text": "Goal:"},
                            {"seq": 1, "text": "Reading"},
                            {"seq": 2, "text": "comprehension"},
                        ],
                    }
                ],
            }
        ],
    }


def _sample_extraction_json() -> str:
    return json.dumps(
        {
            "candidateFacts": [
                {
                    "id": "fact-1",
                    "construct": {"measure": "reading_comprehension", "task": "annual goal"},
                    "value": {"kind": "text", "textValue": "Reading comprehension"},
                    "modality": "planned",
                    "evidence": [
                        {
                            "sourceDocumentId": "doc-a",
                            "page": 1,
                            "quote": "Reading comprehension",
                        }
                    ],
                }
            ]
        }
    )


def _mock_reader_run_result() -> ReaderRunResult:
    fact = CandidateFact(
        id="fact-1",
        construct=ConstructParts(measure="reading_comprehension", task="annual goal"),
        value=ClaimValue(kind="text", textValue="Reading comprehension"),
        modality="planned",
        evidence=[
            SourceEvidence(
                sourceDocumentId="doc-a",
                page=1,
                quote="Reading comprehension",
                spanStart=1,
                spanEnd=2,
            )
        ],
    )
    return ReaderRunResult(
        candidate_facts=[fact],
        reasoning_steps=1,
        tool_calls=2,
        stable_system_prefix="STABLE PREFIX SECRET",
        last_lm_messages=[{"role": "system", "content": "prompt leak"}],
    )


@pytest.fixture
def mock_reader_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _sample_extraction_json()

    def fake_forward(self: HiveReaderModule, untrusted_document_bundle: str) -> dspy.Prediction:
        return dspy.Prediction(extraction_json=payload)

    monkeypatch.setattr(HiveReaderModule, "forward", fake_forward)

    class AcceptAllVerifier:
        def verify_fact(self, **kwargs: Any) -> Any:
            from hive_agents.verifier_client import ReaderVerifierResult

            fact = kwargs["fact"]
            ev = fact.evidence[0]
            return ReaderVerifierResult(
                accepted=True,
                reasons=[],
                verified_evidence=[
                    {
                        "sourceDocumentId": ev.sourceDocumentId,
                        "page": ev.page,
                        "quote": ev.quote,
                        "spanStart": ev.spanStart,
                        "spanEnd": ev.spanEnd,
                    }
                ],
            )

    monkeypatch.setattr(
        "hive_agents.app.create_dspy_lm",
        lambda *args, **kwargs: MagicMock(spec=dspy.LM),
    )
    monkeypatch.setattr(
        "hive_agents.app._require_verifier_client",
        lambda: AcceptAllVerifier(),
    )
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)


def test_study_reader_success(client: TestClient, mock_reader_pipeline: None) -> None:
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "study-reader/1"
    assert body["caseId"] == "case-l001"
    assert body["domainId"] == "iep"
    assert body["packVersion"] == "0.0.0-scaffold"
    assert body["reasoningSteps"] >= 1
    assert body["toolCalls"] >= 0
    assert len(body["candidateFacts"]) == 1
    fact = body["candidateFacts"][0]
    assert fact["proposalStatus"] == "candidate"
    assert fact["verificationStatus"] == "proposed"
    assert fact["evidence"][0]["quote"] == "Reading comprehension"


def test_unauthorized_without_token(client: TestClient, mock_reader_pipeline: None) -> None:
    response = client.post("/study/reader", json=_sample_request_body())
    assert response.status_code == 401


def test_unauthorized_with_bad_token(client: TestClient, mock_reader_pipeline: None) -> None:
    response = client.post(
        "/study/reader",
        headers=_auth_headers("wrong-token"),
        json=_sample_request_body(),
    )
    assert response.status_code == 401


def test_wrong_domain_rejected(client: TestClient, mock_reader_pipeline: None) -> None:
    body = _sample_request_body()
    body["domainId"] = "medicaid"
    response = client.post("/study/reader", headers=_auth_headers(), json=body)
    assert response.status_code in {400, 404}


def test_pack_domain_mismatch_with_override(
    client: TestClient,
    mock_reader_pipeline: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HIVE_AGENTS_JSON", str(IEP_AGENTS_JSON))
    get_settings.cache_clear()
    body = _sample_request_body()
    body["domainId"] = "medicaid"
    response = client.post("/study/reader", headers=_auth_headers(), json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "PACK_DOMAIN_MISMATCH"


def test_missing_documents_rejected(client: TestClient, mock_reader_pipeline: None) -> None:
    body = _sample_request_body()
    body["documents"] = []
    response = client.post("/study/reader", headers=_auth_headers(), json=body)
    assert response.status_code == 422


def test_invalid_page_shape_rejected(client: TestClient, mock_reader_pipeline: None) -> None:
    body = _sample_request_body()
    body["documents"][0]["pages"][0]["pageNumber"] = 0
    response = client.post("/study/reader", headers=_auth_headers(), json=body)
    assert response.status_code == 422


def test_verifier_unavailable_fail_closed(
    client: TestClient,
    api_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("hive_agents.app.reader_verifier_config_from_env", lambda: None)
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "VERIFIER_UNAVAILABLE"


def test_reader_exception_returns_controlled_error(
    client: TestClient,
    api_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "hive_agents.app.execute_study_reader",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ReaderError("boom")),
    )
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "READER_FAILED"


def test_execution_limits_enforced(
    client: TestClient,
    api_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "hive_agents.app.execute_study_reader",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            ReaderLimitsExhausted("Reader tool call budget exhausted (1).")
        ),
    )
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "READER_LIMITS_EXCEEDED"


def test_import_and_health_without_model_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HIVE_ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    with patch("hive_agents.app.create_dspy_lm") as mock_lm:
        from hive_agents.app import app as imported_app

        assert imported_app.title == "Hive Agents"
        client = TestClient(imported_app)
        assert client.get("/health").status_code == 200
        mock_lm.assert_not_called()


def test_response_does_not_leak_secrets_or_prompts(
    client: TestClient,
    mock_reader_pipeline: None,
) -> None:
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 200
    raw = response.text.lower()
    assert "test-key" not in raw
    assert "stable prefix secret" not in raw
    assert "prompt leak" not in raw
    assert "last_lm_messages" not in raw
    pack = load_agent_pack(IEP_AGENTS_JSON)
    assert pack.agents.reader[:40].lower() not in raw


@pytest.mark.parametrize("architecture", ["case_wide", "parallel_document"])
def test_execute_study_reader_passes_execution_limits_once(
    api_env: None,
    monkeypatch: pytest.MonkeyPatch,
    architecture: str,
) -> None:
    from hive_agents.api_models import StudyReaderRequest

    request_body = _sample_request_body()
    request_body["limits"] = {"maxReasoningSteps": 7, "maxToolCalls": 3}
    parsed = StudyReaderRequest.model_validate(request_body)
    expected_limits = ReaderExecutionLimits(max_reasoning_steps=7, max_tool_calls=3)
    captured: dict[str, Any] = {}

    monkeypatch.setenv("HIVE_READER_ARCHITECTURE_VARIANT", architecture)
    get_settings.cache_clear()
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock(spec=dspy.LM))
    monkeypatch.setattr(
        "hive_agents.app._require_verifier_client",
        lambda: ReaderVerifierClient(
            ReaderVerifierConfig(base_url="http://127.0.0.1:4319", token="verifier-token-test"),
        ),
    )
    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "1")
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)

    if architecture == "case_wide":

        def capture_run_reader(**kwargs: Any) -> ReaderRunResult:
            captured.update(kwargs)
            return _mock_reader_run_result()

        monkeypatch.setattr("hive_agents.app.run_reader", capture_run_reader)
    else:

        def capture_parallel(**kwargs: Any) -> tuple[
            ReaderRunResult,
            ReaderExperimentTiming,
            DedupStats,
            list[ParallelExtractionTaskResult],
        ]:
            captured.update(kwargs)
            return (
                _mock_reader_run_result(),
                ReaderExperimentTiming(),
                DedupStats(pre_merge_count=0, post_merge_count=0, removed_count=0),
                [],
            )

        monkeypatch.setattr("hive_agents.app.run_reader_parallel_document", capture_parallel)

    execute_study_reader(parsed)

    if architecture == "case_wide":
        assert captured.get("limits") == expected_limits
    else:
        assert captured.get("merge_limits") == expected_limits


def test_production_path_uses_verifier_not_in_memory(
    api_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = _sample_request_body()
    from hive_agents.api_models import StudyReaderRequest

    parsed = StudyReaderRequest.model_validate(request)
    captured: dict[str, Any] = {}

    def capture_run_reader(**kwargs: Any) -> ReaderRunResult:
        captured.update(kwargs)
        return _mock_reader_run_result()

    monkeypatch.setattr("hive_agents.app.run_reader", capture_run_reader)
    monkeypatch.setattr("hive_agents.app.create_dspy_lm", lambda: MagicMock(spec=dspy.LM))
    monkeypatch.setattr(
        "hive_agents.app._require_verifier_client",
        lambda: ReaderVerifierClient(
            ReaderVerifierConfig(base_url="http://127.0.0.1:4319", token="verifier-token-test"),
        ),
    )

    monkeypatch.setenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", "1")
    get_settings.cache_clear()
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)
    with patch.object(InMemoryReaderTools, "__init__", side_effect=AssertionError("no in-memory")):
        execute_study_reader(parsed)

    assert captured.get("verifier_client") is not None
    assert captured.get("verify_context") is not None
    assert captured.get("tools") is None


def test_audit_not_configured_when_trace_env_missing_and_opted_in(
    client: TestClient,
    mock_reader_pipeline: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 200
    audit = response.json().get("audit")
    assert audit is not None
    assert audit["persisted"] is False
    assert audit["status"] == "not_configured"


def test_audit_required_fail_closed_without_opt_in(
    client: TestClient,
    mock_reader_pipeline: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT", raising=False)
    get_settings.cache_clear()
    monkeypatch.setattr("hive_agents.app.reader_trace_config_from_env", lambda: None)
    response = client.post(
        "/study/reader",
        headers=_auth_headers(),
        json=_sample_request_body(),
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUDIT_UNAVAILABLE"


def test_study_reader_wire_defaults_page_document_id_to_source_document_id() -> None:
    from hive_agents.api_models import StudyReaderDocumentInput

    authoritative_id = "00000000-0000-4000-8000-000000000001"
    doc = StudyReaderDocumentInput.model_validate(
        {
            "sourceDocumentId": authoritative_id,
            "pages": [{"pageNumber": 1, "words": [{"seq": 0, "text": "Hello"}]}],
        }
    )
    assert doc.source_document_id == authoritative_id
    assert doc.pages[0].to_document_page().documentId == authoritative_id


def test_study_reader_wire_rejects_page_document_id_mismatch() -> None:
    from hive_agents.api_models import StudyReaderDocumentInput

    authoritative_id = "00000000-0000-4000-8000-000000000001"
    with pytest.raises(ValueError, match="sourceDocumentId"):
        StudyReaderDocumentInput.model_validate(
            {
                "sourceDocumentId": authoritative_id,
                "pages": [
                    {
                        "documentId": "01_initial_referral.pdf",
                        "pageNumber": 1,
                        "words": [{"seq": 0, "text": "Hello"}],
                    }
                ],
            }
        )
