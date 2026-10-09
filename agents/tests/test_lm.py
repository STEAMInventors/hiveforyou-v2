from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from hive_agents import lm as lm_module
from hive_agents.lm import (
    NormalizedModelUsage,
    build_anthropic_chat_messages,
    build_dspy_lm_messages,
    configure_dspy_lm,
    create_dspy_lm,
    litellm_completion_kwargs_from_messages,
    normalize_model_usage,
    resolve_lm_config,
)
from hive_agents.settings import Settings, get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_resolve_lm_config_anthropic_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MODEL_PROVIDER", raising=False)
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.delenv("MODEL_MAX_OUTPUT_TOKENS", raising=False)
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")

    config = resolve_lm_config(Settings(_env_file=None))

    assert config.provider == "anthropic"
    assert config.model_name == "claude-opus-5-5"
    assert config.dspy_model == "anthropic/claude-opus-5-5"
    assert config.max_output_tokens == 16_000


def test_missing_api_key_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HIVE_ANTHROPIC_API_KEY", raising=False)
    settings = Settings(_env_file=None)

    with pytest.raises(ValueError, match="HIVE_ANTHROPIC_API_KEY"):
        resolve_lm_config(settings)


def test_optional_workspace_header_in_completion_kwargs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("HIVE_ANTHROPIC_WORKSPACE_ID", "ws-123")
    config = resolve_lm_config(Settings(_env_file=None))
    messages = build_anthropic_chat_messages(
        stable_system="pack instructions",
        case_user_content="case body",
    )
    kwargs = litellm_completion_kwargs_from_messages(config=config, messages=messages)

    assert kwargs["extra_headers"] == {"anthropic-workspace-id": "ws-123"}


def test_invalid_provider_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")

    with pytest.raises(ValueError, match="MODEL_PROVIDER"):
        resolve_lm_config(Settings(_env_file=None))


def test_invalid_token_limit_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_MAX_OUTPUT_TOKENS", "0")

    with pytest.raises(ValueError, match="MODEL_MAX_OUTPUT_TOKENS"):
        Settings(_env_file=None)


def test_import_and_configure_do_not_call_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    calls: list[Any] = []

    def fake_factory(**kwargs: Any) -> MagicMock:
        calls.append(kwargs)
        return MagicMock()

    with patch.object(lm_module, "dspy") as mock_dspy:
        mock_dspy.LM = fake_factory
        imported = __import__("hive_agents.app", fromlist=["app"])
        assert imported.app.title == "Hive Agents"
        configure_dspy_lm(lm_factory=fake_factory)

    assert len(calls) == 1
    assert calls[0]["model"] == "anthropic/claude-opus-5-5"
    assert calls[0]["api_key"] == "test-key"
    assert calls[0]["cache"] is False
    assert calls[0]["engine"] == "lm15"
    assert calls[0]["prompt_cache"].prefix == "stable"


def test_create_dspy_lm_workspace_and_prompt_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("HIVE_ANTHROPIC_WORKSPACE_ID", "ws-abc")
    captured: dict[str, Any] = {}

    def fake_factory(**kwargs: Any) -> MagicMock:
        captured.update(kwargs)
        return MagicMock()

    create_dspy_lm(lm_factory=fake_factory)

    assert captured["engine"] == "lm15"
    assert "extra_headers" not in captured
    assert captured["prompt_cache"].mode == "auto"
    config = resolve_lm_config(Settings(_env_file=None))
    litellm_kwargs = litellm_completion_kwargs_from_messages(
        config=config,
        messages=build_anthropic_chat_messages(
            stable_system="pack",
            case_user_content="case",
        ),
    )
    assert litellm_kwargs["extra_headers"] == {"anthropic-workspace-id": "ws-abc"}


def test_cache_markers_on_stable_prefix_only() -> None:
    messages = build_anthropic_chat_messages(
        stable_system="stable pack text",
        case_user_content="changing case text",
    )
    system_content = messages[0]["content"]
    assert isinstance(system_content, list)
    assert system_content[0]["cache_control"] == {"type": "ephemeral"}
    assert "cache_control" not in messages[1]["content"]


def test_cache_markers_pass_through_litellm_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    config = resolve_lm_config(Settings(_env_file=None))
    messages = build_anthropic_chat_messages(
        stable_system="stable",
        case_user_content="case",
    )
    tools = [{"type": "function", "function": {"name": "read_doc", "parameters": {}}}]
    kwargs = litellm_completion_kwargs_from_messages(
        config=config,
        messages=messages,
        tools=tools,
    )

    from litellm.llms.anthropic.common_utils import AnthropicModelInfo

    assert AnthropicModelInfo().is_cache_control_set(kwargs["messages"]) is True
    assert kwargs["tools"][-1]["cache_control"] == {"type": "ephemeral"}


def test_normalize_usage_cached_and_uncached() -> None:
    cached = normalize_model_usage(
        {
            "input_tokens": 100,
            "output_tokens": 20,
            "cache_read_input_tokens": 50,
            "cache_creation_input_tokens": 10,
        }
    )
    assert cached == NormalizedModelUsage(
        input_tokens=100,
        output_tokens=20,
        cache_read_input_tokens=50,
        cache_write_input_tokens=10,
    )

    uncached = normalize_model_usage({"prompt_tokens": 80, "completion_tokens": 12})
    assert uncached.cache_read_input_tokens is None
    assert uncached.cache_write_input_tokens is None
    assert uncached.input_tokens == 80
    assert uncached.output_tokens == 12


def test_normalize_usage_camel_case_and_zero_cache() -> None:
    usage = normalize_model_usage(
        {
            "inputTokens": 1,
            "outputTokens": 2,
            "cacheReadInputTokens": 0,
            "cacheWriteInputTokens": 0,
        }
    )
    assert usage.cache_read_input_tokens == 0
    assert usage.cache_write_input_tokens == 0


def test_normalize_usage_missing_cache_fields() -> None:
    usage = normalize_model_usage({"input_tokens": 5, "output_tokens": 1})
    assert usage.cache_read_input_tokens is None
    assert usage.cache_write_input_tokens is None


def test_normalize_usage_dspy_history_prompt_details() -> None:
    usage = normalize_model_usage(
        {
            "prompt_tokens": 160,
            "completion_tokens": 20,
            "prompt_tokens_details": {
                "cached_tokens": 50,
                "cache_creation_tokens": 10,
            },
        }
    )
    assert usage.cache_read_input_tokens == 50
    assert usage.cache_write_input_tokens == 10


def _anthropic_success_body(*, cache_read: int = 50, cache_write: int = 10) -> bytes:
    return json.dumps(
        {
            "id": "msg_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": 100,
                "output_tokens": 20,
                "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": cache_write,
            },
        }
    ).encode()


@pytest.fixture
def mock_anthropic_transport(monkeypatch: pytest.MonkeyPatch) -> dict[str, list[Any]]:
    """Capture Anthropic wire payloads and return a canned HTTP response."""
    from dspy._vendor.lm15.providers.anthropic import AnthropicLM
    from dspy._vendor.lm15.providers.base import HttpResponse

    state: dict[str, list[Any]] = {"payloads": []}
    original_payload = AnthropicLM._payload

    def capture_payload(self, request, stream=False):
        payload = original_payload(self, request, stream)
        state["payloads"].append(payload)
        return payload

    def fake_send(self, request):
        return HttpResponse(
            status=200,
            reason="OK",
            headers={},
            body=_anthropic_success_body(),
            http_version="HTTP/1.1",
            provider="anthropic",
        )

    monkeypatch.setattr(AnthropicLM, "_payload", capture_payload)
    monkeypatch.setattr(AnthropicLM, "_send", fake_send)
    return state


def test_dspy_lm_applies_ephemeral_cache_on_stable_system_at_provider_boundary(
    monkeypatch: pytest.MonkeyPatch,
    mock_anthropic_transport: dict[str, list[Any]],
) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    stable = "stable pack instructions v1"
    lm = create_dspy_lm()
    lm(messages=build_dspy_lm_messages(stable_system=stable, case_user_content="case body A"))

    assert len(mock_anthropic_transport["payloads"]) == 1
    system = mock_anthropic_transport["payloads"][0]["system"]
    assert system == [
        {"type": "text", "text": stable, "cache_control": {"type": "ephemeral"}},
    ]
    user_message = mock_anthropic_transport["payloads"][0]["messages"][-1]
    assert user_message["role"] == "user"
    user_blocks = user_message["content"]
    assert user_blocks == [{"type": "text", "text": "case body A"}]
    assert all("cache_control" not in block for block in user_blocks)


def test_dspy_lm_stable_cached_prefix_unchanged_when_case_user_content_changes(
    monkeypatch: pytest.MonkeyPatch,
    mock_anthropic_transport: dict[str, list[Any]],
) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    stable = "stable pack prefix"
    lm = create_dspy_lm()
    lm(messages=build_dspy_lm_messages(stable_system=stable, case_user_content="first case"))
    lm(messages=build_dspy_lm_messages(stable_system=stable, case_user_content="second case"))

    assert len(mock_anthropic_transport["payloads"]) == 2
    first_system = mock_anthropic_transport["payloads"][0]["system"]
    second_system = mock_anthropic_transport["payloads"][1]["system"]
    assert first_system == second_system
    assert mock_anthropic_transport["payloads"][0]["messages"][-1]["content"] == [
        {"type": "text", "text": "first case"},
    ]
    assert mock_anthropic_transport["payloads"][1]["messages"][-1]["content"] == [
        {"type": "text", "text": "second case"},
    ]


def test_dspy_lm_cache_usage_from_execution_path(
    monkeypatch: pytest.MonkeyPatch,
    mock_anthropic_transport: dict[str, list[Any]],
) -> None:
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    lm = create_dspy_lm()
    lm(messages=build_dspy_lm_messages(stable_system="pack", case_user_content="case"))

    usage = normalize_model_usage(lm.history[-1]["usage"])
    assert usage.cache_read_input_tokens == 50
    assert usage.cache_write_input_tokens == 10


def test_build_anthropic_chat_messages_incompatible_with_dspy_lm_conversion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Manual cache_control blocks are rejected when converting to lm15 Request."""
    monkeypatch.setenv("HIVE_ANTHROPIC_API_KEY", "test-key")
    lm = create_dspy_lm()
    with pytest.raises(Exception, match="cache_control"):
        lm(
            messages=build_anthropic_chat_messages(
                stable_system="pack",
                case_user_content="case",
            )
        )
