from __future__ import annotations

from pathlib import Path

import pytest

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader_prompt.assemble import assemble_reader_architecture_prompt
from hive_agents.reader_prompt.golden_reference import load_golden_reference_methodology_body
from hive_agents.reader_prompt.sections_shared import (
    shared_sections_after_checklist,
    shared_sections_before_golden_methodology,
)


@pytest.fixture
def iep_pack() -> object:
    repo = Path(__file__).resolve().parents[2]
    return load_agent_pack(repo / "engine" / "domain-packs" / "iep" / "study" / "agents.json")


def test_full_golden_reference_embedded(iep_pack) -> None:
    body = load_golden_reference_methodology_body()
    assert "canonical-study-proposal/4" in body
    assert "Voice proposal" in body
    assert len(body) > 4000


def test_architectures_differ_only_in_section_five(iep_pack) -> None:
    a = assemble_reader_architecture_prompt("case_wide", pack=iep_pack)
    b = assemble_reader_architecture_prompt("parallel_document", pack=iep_pack)
    assert a.prompt_sha256 != b.prompt_sha256
    assert "case-wide architecture" in a.stable_system_prefix
    assert "parallel-document architecture" in b.stable_system_prefix


def test_no_legacy_slash_three_value_instructions(iep_pack) -> None:
    for architecture in ("case_wide", "parallel_document"):
        assembled = assemble_reader_architecture_prompt(architecture, pack=iep_pack)
        lowered = assembled.stable_system_prefix.lower()
        assert "`/3`" not in assembled.stable_system_prefix
        assert "legacy third-generation" in lowered


def test_shared_sections_before_golden_methodology(iep_pack) -> None:
    case = shared_sections_before_golden_methodology(architecture="case_wide")
    parallel = shared_sections_before_golden_methodology(architecture="parallel_document")
    assert case != parallel
    after = shared_sections_after_checklist()
    assert "## 7." in after
