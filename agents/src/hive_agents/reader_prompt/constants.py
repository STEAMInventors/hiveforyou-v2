from __future__ import annotations

from hive_agents.reader import ReaderExecutionLimits

PROMPT_VERSION = "hive-reader-prompt/2.0.0"

READER_ARCHITECTURE_VARIANTS = frozenset({"case_wide", "parallel_document"})

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
