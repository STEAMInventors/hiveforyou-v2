from __future__ import annotations

import json
from typing import Any

import pytest

from hive_agents.writer import run_hive_writer
from hive_agents.writer_contract import load_hive_writer_anthropic_contract
from hive_agents.writer_errors import WriterModelError


@pytest.fixture(autouse=True)
def _writer_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")


def test_contract_anthropic_constrained_supported() -> None:
    contract = load_hive_writer_anthropic_contract()
    assert contract.anthropic_constrained_supported is True
    assert contract.response_format is not None
    assert contract.response_format["type"] == "json_schema"
    assert contract.response_format["json_schema"]["name"] == "hive_writer_proposal_v1"


def test_run_hive_writer_lm15_sends_output_config_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dspy._vendor.lm15.providers.anthropic import AnthropicLM
    from dspy._vendor.lm15.providers.base import HttpResponse

    from hive_agents.lm import create_dspy_lm
    from hive_agents.settings import get_settings

    contract = load_hive_writer_anthropic_contract()

    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    get_settings.cache_clear()

    captured: dict[str, object] = {"payloads": []}
    original_payload = AnthropicLM._payload

    def capture_payload(self, request, stream=False):
        payload = original_payload(self, request, stream)
        captured["payloads"].append(payload)
        return payload

    def fake_send(self, request):
        return HttpResponse(
            status=200,
            reason="OK",
            headers={},
            body=json.dumps(
                {
                    "id": "msg_test",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-opus-5-5",
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(
                                {
                                    "schemaVersion": "hive-writer-proposal/1",
                                    "hiveUiTree": {"root": "x", "elements": []},
                                }
                            ),
                        }
                    ],
                    "stop_reason": "end_turn",
                    "usage": {"input_tokens": 1, "output_tokens": 1},
                }
            ).encode(),
            http_version="HTTP/1.1",
            provider="anthropic",
        )

    monkeypatch.setattr(AnthropicLM, "_payload", capture_payload)
    monkeypatch.setattr(AnthropicLM, "_send", fake_send)

    lm = create_dspy_lm()
    run_hive_writer(writer_input={"audience": "customer"}, lm=lm)

    payloads = captured["payloads"]
    assert payloads
    payload = payloads[-1]
    assert isinstance(payload, dict)
    output_config = payload.get("output_config")
    assert isinstance(output_config, dict)
    wire_format = output_config.get("format")
    assert isinstance(wire_format, dict)
    assert wire_format.get("type") == "json_schema"
    assert wire_format.get("schema") == contract.response_format["json_schema"]["schema"]


def test_run_hive_writer_normalizes_elements_array(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    contract = load_hive_writer_anthropic_contract()
    monkeypatch.setattr(
        "hive_agents.writer.load_hive_writer_anthropic_contract",
        lambda: contract,
    )
    proposal = {
        "schemaVersion": "hive-writer-proposal/1",
        "hiveUiTree": {
            "root": "report-root",
            "elements": [
                {"id": "report-root", "type": "ReportRoot", "props": {}},
            ],
        },
    }
    lm = _CapturingLm(response=json.dumps(proposal))
    result = run_hive_writer(writer_input={"audience": "customer"}, lm=lm)
    assert result.proposal["hiveUiTree"]["elements"] == {
        "report-root": {"type": "ReportRoot", "props": {}},
    }


class _CapturingLm:
    model = "test-writer-model"

    def __init__(self, *, response: Any) -> None:
        self._response = response
        self.kwargs = {"max_tokens": 16000}
        self.history = [{"usage": {"input_tokens": 10, "output_tokens": 20}, "response": {"stop_reason": "end_turn"}}]

    def forward(self, *, messages: object, response_format: dict[str, Any]) -> Any:
        return self._response
