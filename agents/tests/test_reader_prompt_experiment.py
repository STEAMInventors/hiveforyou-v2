from __future__ import annotations

import json
from pathlib import Path

import pytest

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader_prompt.assemble import assemble_reader_architecture_prompt
from hive_agents.reader_prompt.constants import PROMPT_VERSION


@pytest.fixture
def iep_pack() -> object:
    repo = Path(__file__).resolve().parents[2]
    return load_agent_pack(repo / "engine" / "domain-packs" / "iep" / "study" / "agents.json")


def test_committed_prompt_hashes_match_assembler(iep_pack) -> None:
    repo = Path(__file__).resolve().parents[2]
    hashes_path = repo / "engine" / "eval" / "reports" / "reader-experiment" / "prompt-hashes.json"
    if not hashes_path.is_file():
        pytest.skip("Run agents/scripts/review_reader_experiment_prompts.py to generate prompt-hashes.json")
    payload = json.loads(hashes_path.read_text(encoding="utf-8"))
    assert payload["promptVersion"] == PROMPT_VERSION
    case = assemble_reader_architecture_prompt("case_wide", pack=iep_pack)
    parallel = assemble_reader_architecture_prompt("parallel_document", pack=iep_pack)
    assert case.prompt_sha256 == payload["case_wide_sha256"]
    assert parallel.prompt_sha256 == payload["parallel_document_sha256"]
