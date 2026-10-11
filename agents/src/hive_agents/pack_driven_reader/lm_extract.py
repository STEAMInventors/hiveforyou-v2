from __future__ import annotations

import json
from typing import Any

import dspy

from hive_agents.lm import build_dspy_lm_messages, normalize_model_usage
from hive_agents.pack_driven_reader.compiler_bridge import PackDrivenReaderCompileResult


def _extract_assistant_text(response: Any) -> str:
    if response is None:
        return ""
    if isinstance(response, str):
        return response
    if isinstance(response, list):
        parts: list[str] = []
        for block in response:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    choices = getattr(response, "choices", None)
    if choices:
        first = choices[0]
        message = getattr(first, "message", None) or (first.get("message") if isinstance(first, dict) else None)
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return _extract_assistant_text(content)
    if isinstance(response, dict):
        content = response.get("content")
        if isinstance(content, list):
            return _extract_assistant_text(content)
        message = response.get("message")
        if isinstance(message, dict):
            return _extract_assistant_text(message.get("content"))
    return str(response)


def _parse_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        return {}
    try:
        parsed = json.loads(stripped)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(stripped[start : end + 1])
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
    return {}


def call_pack_driven_extraction(
    *,
    lm: dspy.LM,
    compiled: PackDrivenReaderCompileResult,
) -> tuple[dict[str, Any], dict[str, int | None]]:
    messages = build_dspy_lm_messages(
        stable_system=compiled.stable_system_prefix,
        case_user_content=compiled.case_user_content,
    )
    forward = getattr(lm, "forward", None)
    if callable(forward):
        response = forward(messages=messages)
    else:
        response = lm(messages=messages)
    text = _extract_assistant_text(response)
    raw = _parse_json_object(text)
    usage = normalize_model_usage(
        lm.history[-1].get("usage") if getattr(lm, "history", None) else None
    )
    usage_dict: dict[str, int | None] = {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_read_input_tokens": usage.cache_read_input_tokens,
        "cache_write_input_tokens": usage.cache_write_input_tokens,
    }
    return raw, usage_dict
