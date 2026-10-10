from __future__ import annotations

from hive_agents.reader import ReaderExecutionLimits

PROMPT_VERSION = "hive-reader-prompt/1.0.0"

READER_EXPERIMENT_VARIANTS = frozenset({"golden_inspired", "existing_reader_structured"})

# Verified tool accounting: 1 list_documents + N read_pages (L001 N=8).
READER_EXPERIMENT_L001_DOCUMENT_COUNT = 8
READER_EXPERIMENT_FIXED_TOOL_OVERHEAD = 1 + READER_EXPERIMENT_L001_DOCUMENT_COUNT

# Golden L001 has 117 facts; buffer for over-extraction + margin.
READER_EXPERIMENT_VERIFIER_BUFFER = 150 + 6

READER_EXPERIMENT_L001_LIMITS = ReaderExecutionLimits(
    max_reasoning_steps=4,
    max_tool_calls=READER_EXPERIMENT_FIXED_TOOL_OVERHEAD + READER_EXPERIMENT_VERIFIER_BUFFER,
)
