from __future__ import annotations

from hive_agents.reader import ReaderExecutionLimits

PROMPT_VERSION = "hive-reader-prompt/2.0.0"

READER_ARCHITECTURE_VARIANTS = frozenset({"case_wide", "parallel_document"})

READER_PARALLEL_PROMPT_VARIANTS = frozenset({"p6"})


def resolve_parallel_prompt_variant(raw: str | None) -> str | None:
    """B-P6 prompt parity when ``p6``; baseline parallel B when unset."""
    if raw is None:
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    normalized = stripped.lower().replace("_", "-")
    if normalized in {"baseline", "b", "default"}:
        return None
    if normalized in {"p6", "b-p6", "bp6"}:
        return "p6"
    if normalized in READER_PARALLEL_PROMPT_VARIANTS:
        return normalized
    raise ValueError(
        f"Unsupported HIVE_READER_PARALLEL_PROMPT_VARIANT: {raw!r} "
        f"(use p6 for B-P6 or leave unset for baseline parallel B)"
    )

READER_EXPERIMENT_L001_DOCUMENT_COUNT = 8
READER_EXPERIMENT_FIXED_TOOL_OVERHEAD = 1 + READER_EXPERIMENT_L001_DOCUMENT_COUNT

READER_EXPERIMENT_VERIFIER_BUFFER = 150 + 6

READER_EXPERIMENT_L001_LIMITS = ReaderExecutionLimits(
    max_reasoning_steps=4,
    max_tool_calls=READER_EXPERIMENT_FIXED_TOOL_OVERHEAD + READER_EXPERIMENT_VERIFIER_BUFFER,
)

READER_EXPERIMENT_PARALLEL_PER_DOC_LIMITS = ReaderExecutionLimits(
    max_reasoning_steps=2,
    max_tool_calls=4,
)

DEFAULT_PARALLEL_CONCURRENCY = 8
