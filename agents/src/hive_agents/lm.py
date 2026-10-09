from __future__ import annotations

from collections.abc import Callable, Mapping, MutableMapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

import dspy
from dspy.lm15 import CacheConfig

from hive_agents.settings import Settings, get_settings

EPHEMERAL_CACHE_CONTROL: dict[str, str] = {"type": "ephemeral"}

MessageContent = str | list[dict[str, Any]]
ChatMessage = dict[str, Any]


@dataclass(frozen=True)
class LmConfig:
    provider: str
    model_name: str
    dspy_model: str
    max_output_tokens: int
    api_key: str
    workspace_id: str | None = None


@dataclass(frozen=True)
class NormalizedModelUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_input_tokens: int | None = None
    cache_write_input_tokens: int | None = None


@runtime_checkable
class LmFactory(Protocol):
    def __call__(self, /, **kwargs: Any) -> dspy.LM: ...


def dspy_model_id(provider: str, model_name: str) -> str:
    if "/" in model_name:
        return model_name
    return f"{provider}/{model_name}"


def resolve_lm_config(settings: Settings | None = None) -> LmConfig:
    resolved = settings or get_settings()
    resolved.validate_lm_env()
    return LmConfig(
        provider=resolved.model_provider,
        model_name=resolved.model_name,
        dspy_model=dspy_model_id(resolved.model_provider, resolved.model_name),
        max_output_tokens=resolved.model_max_output_tokens,
        api_key=resolved.anthropic_api_key or "",
        workspace_id=resolved.anthropic_workspace_id,
    )


def anthropic_prompt_cache_config() -> CacheConfig:
    """Provider-side prompt cache intent for stable system/tools prefixes (lm15)."""
    return CacheConfig(mode="auto", prefix="stable")


def with_ephemeral_cache_control(block: Mapping[str, Any]) -> dict[str, Any]:
    """Attach Anthropic ``cache_control`` to a LiteLLM/OpenAI-style content block."""
    copied = dict(block)
    copied["cache_control"] = dict(EPHEMERAL_CACHE_CONTROL)
    return copied


def text_block(text: str, *, cache: bool = False) -> dict[str, Any]:
    block: dict[str, Any] = {"type": "text", "text": text}
    return with_ephemeral_cache_control(block) if cache else block


def mark_tools_cache_breakpoint(tools: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]] | None:
    """Mark the last tool definition as a cache breakpoint when tools are present."""
    if not tools:
        return None
    marked: list[dict[str, Any]] = [dict(tool) for tool in tools]
    marked[-1] = with_ephemeral_cache_control(marked[-1])
    return marked


def build_dspy_lm_messages(
    *,
    stable_system: str,
    case_user_content: str,
) -> list[ChatMessage]:
    """
    Build OpenAI-style chat messages for ``dspy.LM``.

    Do not embed ``cache_control`` here — lm15 applies breakpoints from the
    LM's ``prompt_cache`` (``CacheConfig(prefix="stable")``) when building the
    provider payload.
    """
    return [
        {"role": "system", "content": stable_system},
        {"role": "user", "content": case_user_content},
    ]


def build_anthropic_chat_messages(
    *,
    stable_system: str,
    case_user_content: str,
    cache_stable_system: bool = True,
) -> list[ChatMessage]:
    """
    Build chat messages with cache markers on the stable prefix only.

    For direct ``litellm.completion`` shaping — not for ``dspy.LM`` (see
    ``build_dspy_lm_messages``).
    """
    system_block = text_block(stable_system, cache=cache_stable_system)
    return [
        {"role": "system", "content": [system_block]},
        {"role": "user", "content": case_user_content},
    ]


def litellm_completion_kwargs_from_messages(
    *,
    config: LmConfig,
    messages: Sequence[Mapping[str, Any]],
    tools: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Shape kwargs for ``litellm.completion`` without performing a network call."""
    kwargs: dict[str, Any] = {
        "model": config.dspy_model,
        "messages": [dict(message) for message in messages],
        "max_tokens": config.max_output_tokens,
        "api_key": config.api_key,
    }
    if config.workspace_id:
        kwargs["extra_headers"] = {"anthropic-workspace-id": config.workspace_id}
    marked_tools = mark_tools_cache_breakpoint(tools)
    if marked_tools is not None:
        kwargs["tools"] = marked_tools
    return kwargs


def _usage_lookup(usage: Mapping[str, Any], *keys: str) -> int | None:
    for key in keys:
        if key not in usage:
            continue
        raw = usage[key]
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)) and float(raw).is_integer():
            return int(raw)
    return None


def normalize_model_usage(usage: object) -> NormalizedModelUsage:
    """
    Normalize token usage from LiteLLM or Anthropic-native response shapes.

    Missing metrics stay ``None``; measured zero is preserved as ``0``.
    """
    if usage is None:
        return NormalizedModelUsage()
    if hasattr(usage, "model_dump"):
        try:
            usage = usage.model_dump()  # type: ignore[assignment]
        except Exception:
            pass
    if not isinstance(usage, Mapping):
        return NormalizedModelUsage()

    record: MutableMapping[str, Any] = dict(usage)
    prompt_details = record.get("prompt_tokens_details")
    if isinstance(prompt_details, Mapping):
        cached = prompt_details.get("cached_tokens")
        if (
            "cache_read_input_tokens" not in record
            and isinstance(cached, (int, float))
            and float(cached).is_integer()
        ):
            record["cache_read_input_tokens"] = int(cached)
        created = prompt_details.get("cache_creation_tokens")
        if (
            "cache_creation_input_tokens" not in record
            and isinstance(created, (int, float))
            and float(created).is_integer()
        ):
            record["cache_creation_input_tokens"] = int(created)

    return NormalizedModelUsage(
        input_tokens=_usage_lookup(
            record,
            "input_tokens",
            "prompt_tokens",
            "inputTokens",
            "promptTokens",
        ),
        output_tokens=_usage_lookup(
            record,
            "output_tokens",
            "completion_tokens",
            "outputTokens",
            "completionTokens",
        ),
        cache_read_input_tokens=_usage_lookup(
            record,
            "cache_read_input_tokens",
            "cacheReadInputTokens",
        ),
        cache_write_input_tokens=_usage_lookup(
            record,
            "cache_creation_input_tokens",
            "cacheWriteInputTokens",
        ),
    )


def create_dspy_lm(
    settings: Settings | None = None,
    *,
    config: LmConfig | None = None,
    lm_factory: LmFactory | None = None,
) -> dspy.LM:
    """
    Construct a DSPy LM from env-backed settings.

    Side-effect free: no provider requests and no global ``dspy.configure``.
    """
    resolved_config = config or resolve_lm_config(settings)
    factory: LmFactory = lm_factory or dspy.LM

    kwargs: dict[str, Any] = {
        "model": resolved_config.dspy_model,
        "max_tokens": resolved_config.max_output_tokens,
        "api_key": resolved_config.api_key,
        "cache": False,
        "engine": "lm15",
        "prompt_cache": anthropic_prompt_cache_config(),
    }
    # Workspace routing uses extra_headers on the LiteLLM shaping path only
    # (``litellm_completion_kwargs_from_messages``). ``extra_headers`` on
    # ``dspy.LM`` forces the LiteLLM compatibility engine, which cannot carry
    # ``prompt_cache`` — keep native lm15 for Anthropic prompt caching.

    return factory(**kwargs)


def configure_dspy_lm(
    settings: Settings | None = None,
    *,
    lm_factory: Callable[..., dspy.LM] | None = None,
) -> dspy.LM:
    """Explicit entry point for constructing the study agents LM."""
    return create_dspy_lm(settings, lm_factory=lm_factory)
