from __future__ import annotations

import json
from pathlib import Path

import pytest

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader_prompt.assemble import assemble_reader_experiment_prompt
from hive_agents.reader_prompt.section6_existing_reader import SECTION_6_EXISTING_READER
from hive_agents.reader_prompt.section6_golden_inspired import SECTION_6_GOLDEN_INSPIRED
from hive_agents.reader_prompt.sections_shared import (
    shared_sections_after_checklist,
    shared_sections_before_checklist,
)


@pytest.fixture
def iep_pack() -> object:
    repo = Path(__file__).resolve().parents[2]
    return load_agent_pack(repo / "engine" / "domain-packs" / "iep" / "study" / "agents.json")


def test_shared_sections_identical_across_variants(iep_pack) -> None:
    a = assemble_reader_experiment_prompt("golden_inspired", pack=iep_pack)
    b = assemble_reader_experiment_prompt("existing_reader_structured", pack=iep_pack)
    shared_before = shared_sections_before_checklist()
    shared_after = shared_sections_after_checklist()
    assert shared_before in a.stable_system_prefix
    assert shared_before in b.stable_system_prefix
    assert shared_after in a.stable_system_prefix
    assert shared_after in b.stable_system_prefix
    assert a.stable_system_prefix != b.stable_system_prefix
    assert a.prompt_sha256 != b.prompt_sha256


def test_section_six_is_only_semantic_diff(iep_pack) -> None:
    a = assemble_reader_experiment_prompt("golden_inspired", pack=iep_pack)
    b = assemble_reader_experiment_prompt("existing_reader_structured", pack=iep_pack)
    assert SECTION_6_GOLDEN_INSPIRED.strip() in a.stable_system_prefix
    assert SECTION_6_EXISTING_READER.strip() in b.stable_system_prefix
    assert SECTION_6_GOLDEN_INSPIRED.strip() not in b.stable_system_prefix


def test_no_legacy_slash_three_value_instructions(iep_pack) -> None:
    for variant in ("golden_inspired", "existing_reader_structured"):
        assembled = assemble_reader_experiment_prompt(variant, pack=iep_pack)
        lowered = assembled.stable_system_prefix.lower()
        assert "/3" not in assembled.stable_system_prefix
        assert "textvalue" in lowered.replace(" ", "")
        assert "candidatefacts" in lowered.replace(" ", "")


def test_prompt_hashes_file_matches_assembled(iep_pack) -> None:
    repo = Path(__file__).resolve().parents[2]
    hashes_path = repo / "engine" / "eval" / "reports" / "reader-experiment" / "prompt-hashes.json"
    if not hashes_path.is_file():
        pytest.skip("Run agents/scripts/review_reader_experiment_prompts.py to generate prompt-hashes.json")
    payload = json.loads(hashes_path.read_text(encoding="utf-8"))
    a = assemble_reader_experiment_prompt("golden_inspired", pack=iep_pack)
    b = assemble_reader_experiment_prompt("existing_reader_structured", pack=iep_pack)
    assert payload["golden_inspired"] == a.prompt_sha256
    assert payload["existing_reader_structured"] == b.prompt_sha256
