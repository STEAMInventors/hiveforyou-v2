from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import dspy

from hive_agents.lm import build_dspy_lm_messages, create_dspy_lm, normalize_model_usage, resolve_lm_config
from hive_agents.pack_driven_reader.lm_extract import _extract_assistant_text, try_parse_json_object
from hive_agents.writer_contract import load_hive_writer_anthropic_contract
from hive_agents.writer_proposal_normalize import normalize_writer_model_proposal_before_validation
from hive_agents.writer_errors import (
    WriterModelDiagnostics,
    WriterModelError,
    classify_json_parse_failure,
    extract_stop_reason,
    map_provider_exception,
)

logger = logging.getLogger(__name__)


def _load_writer_prompt() -> str:
    resolved = Path(__file__).resolve().parent / "prompts" / "hive-writer-v1.md"
    if not resolved.is_file():
        raise FileNotFoundError(f"Hive Writer prompt missing at {resolved}")
    return resolved.read_text(encoding="utf-8")


@dataclass(frozen=True)
class HiveWriterRunResult:
    proposal: dict[str, Any]
    model_identifier: str
    token_usage: dict[str, int | None]


def _history_response(lm: dspy.LM) -> Any:
    history = getattr(lm, "history", None)
    if not history:
        return None
    last = history[-1]
    if isinstance(last, dict):
        return last.get("response")
    return None


def _configured_max_output_tokens(lm: dspy.LM) -> int | None:
    kwargs = getattr(lm, "kwargs", None)
    if not isinstance(kwargs, dict):
        return None
    value = kwargs.get("max_tokens")
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _build_diagnostics(*, lm: dspy.LM, assistant_text: str) -> WriterModelDiagnostics:
    usage = normalize_model_usage(
        lm.history[-1].get("usage") if getattr(lm, "history", None) else None
    )
    configured = _configured_max_output_tokens(lm)
    if configured is None:
        try:
            configured = resolve_lm_config().max_output_tokens
        except ValueError:
            configured = None
    return WriterModelDiagnostics(
        stop_reason=extract_stop_reason(_history_response(lm)),
        output_tokens=usage.output_tokens,
        output_characters=len(assistant_text) if assistant_text else 0,
        configured_max_output_tokens=configured,
    )


def _log_writer_failure(code: str, diagnostics: WriterModelDiagnostics | None) -> None:
    payload: dict[str, Any] = {"code": code}
    if diagnostics is not None:
        payload.update(diagnostics.as_safe_dict())
    logger.warning("hive writer model failure", extra={"writerDiagnostics": payload})


def run_hive_writer(*, writer_input: dict[str, Any], lm: dspy.LM | None = None) -> HiveWriterRunResult:
    contract = load_hive_writer_anthropic_contract()
    response_format = contract.require_constrained_response_format()

    active_lm = lm or create_dspy_lm()
    system = _load_writer_prompt()
    user_payload = json.dumps(writer_input, separators=(",", ":"), sort_keys=True)
    messages = build_dspy_lm_messages(
        stable_system=system,
        case_user_content=f"Return hive-writer-proposal/1 JSON for this input:\n\n{user_payload}",
    )

    assistant_text = ""
    diagnostics: WriterModelDiagnostics | None = None
    try:
        response = active_lm.forward(
            messages=messages,
            response_format=response_format,
        )
        assistant_text = _extract_assistant_text(response)
        diagnostics = _build_diagnostics(lm=active_lm, assistant_text=assistant_text)
    except Exception as exc:
        diagnostics = _build_diagnostics(lm=active_lm, assistant_text=assistant_text)
        mapped = map_provider_exception(exc, diagnostics=diagnostics)
        _log_writer_failure(mapped.code, mapped.diagnostics)
        raise mapped from exc

    parsed = try_parse_json_object(assistant_text)
    if parsed is None:
        failure = classify_json_parse_failure(text=assistant_text, diagnostics=diagnostics)
        _log_writer_failure(failure.code, failure.diagnostics)
        raise failure

    usage = normalize_model_usage(
        active_lm.history[-1].get("usage") if getattr(active_lm, "history", None) else None
    )
    model_name = getattr(active_lm, "model", None) or getattr(active_lm, "model_name", None) or "hive-agents-writer"
    normalized = normalize_writer_model_proposal_before_validation(parsed)

    return HiveWriterRunResult(
        proposal=normalized if isinstance(normalized, dict) else parsed,
        model_identifier=str(model_name),
        token_usage={
            "inputTokens": usage.input_tokens,
            "outputTokens": usage.output_tokens,
            "cacheReadInputTokens": usage.cache_read_input_tokens,
            "cacheWriteInputTokens": usage.cache_write_input_tokens,
        },
    )
