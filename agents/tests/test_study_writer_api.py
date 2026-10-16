from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from hive_agents.app import app
from hive_agents.settings import get_settings
from hive_agents.writer import HiveWriterRunResult, run_hive_writer
from hive_agents.writer_contract import HiveWriterAnthropicContract
from hive_agents.writer_errors import WriterModelError


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def api_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HIVE_AGENTS_SERVICE_TOKEN", "service-token-test")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()


@pytest.fixture
def client(api_env: None) -> TestClient:
    return TestClient(app)


@pytest.fixture(autouse=True)
def _supported_writer_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    contract = HiveWriterAnthropicContract(
        schema_version="hive-writer-anthropic-contract/1",
        schema_name="hive_writer_proposal_v1",
        proposal_schema_version="hive-writer-proposal/1",
        schema_sha256="a" * 64,
        anthropic_constrained_supported=True,
        unsupported_reason=None,
        response_format={
            "type": "json_schema",
            "name": "hive_writer_proposal_v1",
            "strict": True,
            "schema": {"type": "object"},
        },
    )
    monkeypatch.setattr(
        "hive_agents.writer.load_hive_writer_anthropic_contract",
        lambda: contract,
    )


def test_study_writer_route_registered(client: TestClient) -> None:
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/study/writer" in paths


def test_study_writer_returns_proposal_with_mocked_lm(client: TestClient) -> None:
    proposal = {
        "schemaVersion": "hive-writer-proposal/1",
        "hiveUiTree": {"schemaVersion": "hive-ui-tree/1", "root": {"type": "section", "children": []}},
    }
    mocked = HiveWriterRunResult(
        proposal=proposal,
        model_identifier="test-model",
        token_usage={"inputTokens": 1, "outputTokens": 2, "cacheReadInputTokens": None, "cacheWriteInputTokens": None},
    )

    with patch("hive_agents.app.run_hive_writer", return_value=mocked):
        response = client.post(
            "/study/writer",
            headers={"Authorization": "Bearer service-token-test"},
            json={"schemaVersion": "study-writer/1", "input": {"audience": "customer"}},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "study-writer/1"
    assert body["proposal"] == proposal
    assert body["modelIdentifier"] == "test-model"


def test_study_writer_returns_422_when_model_json_invalid(client: TestClient) -> None:
    with patch(
        "hive_agents.app.run_hive_writer",
        side_effect=WriterModelError("WRITER_MODEL_JSON_MALFORMED"),
    ):
        response = client.post(
            "/study/writer",
            headers={"Authorization": "Bearer service-token-test"},
            json={"schemaVersion": "study-writer/1", "input": {"audience": "customer"}},
        )

    assert response.status_code == 422
    body = response.json()
    error = body.get("detail", body).get("error", body.get("error"))
    assert error["code"] == "WRITER_MODEL_JSON_MALFORMED"


def _mock_writer_lm(*, response: Any) -> Any:
    class _FakeLm:
        model = "test-writer-model"
        kwargs = {"max_tokens": 16000}
        history = [{"usage": {"input_tokens": 100, "output_tokens": 50}, "response": {"stop_reason": "end_turn"}}]

        def forward(self, *, messages: object, **kwargs: Any) -> Any:
            return response

    return _FakeLm()


def test_run_hive_writer_parses_synthetic_responses(_supported_writer_contract: None) -> None:
    proposal = {"schemaVersion": "hive-writer-proposal/1", "hiveUiTree": {"root": "x"}}
    for response in (
        json.dumps(proposal),
        f"```json\n{json.dumps(proposal)}\n```",
        [{"type": "text", "text": json.dumps(proposal)}],
    ):
        result = run_hive_writer(writer_input={"audience": "customer"}, lm=_mock_writer_lm(response=response))
        assert result.proposal == proposal


def test_study_writer_returns_503_when_provider_schema_unsupported(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    blocked = HiveWriterAnthropicContract(
        schema_version="hive-writer-anthropic-contract/1",
        schema_name="hive_writer_proposal_v1",
        proposal_schema_version="hive-writer-proposal/1",
        schema_sha256="b" * 64,
        anthropic_constrained_supported=False,
        unsupported_reason="MAP_TYPED_ADDITIONAL_PROPERTIES",
        response_format=None,
    )
    monkeypatch.setattr(
        "hive_agents.writer.load_hive_writer_anthropic_contract",
        lambda: blocked,
    )
    response = client.post(
        "/study/writer",
        headers={"Authorization": "Bearer service-token-test"},
        json={"schemaVersion": "study-writer/1", "input": {"audience": "customer"}},
    )
    assert response.status_code == 503
    body = response.json()
    error = body.get("detail", body).get("error", body.get("error"))
    assert error["code"] == "WRITER_PROVIDER_SCHEMA_UNSUPPORTED"


def test_run_hive_writer_rejects_unparseable_synthetic_responses(
    _supported_writer_contract: None,
) -> None:
    for response in (
        '{"schemaVersion": "hive-writer-proposal/1",',
        '{"schemaVersion": "hive-writer-proposal/1", "hiveUiTree": {',
        "[1, 2, 3]",
    ):
        with pytest.raises(WriterModelError) as exc:
            run_hive_writer(writer_input={"audience": "customer"}, lm=_mock_writer_lm(response=response))
        assert exc.value.code in {"WRITER_MODEL_JSON_MALFORMED", "WRITER_MODEL_JSON_INVALID"}
