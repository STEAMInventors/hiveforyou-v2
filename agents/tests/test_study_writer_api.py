from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from hive_agents.app import app
from hive_agents.settings import get_settings
from hive_agents.writer import HiveWriterRunResult


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
