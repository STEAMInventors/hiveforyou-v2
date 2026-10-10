from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from hive_agents.pack_loader import load_agent_pack
from hive_agents.reader_experiment_runtime import resolve_reader_stable_system_for_request
from hive_agents.reader_prompt.assemble import assemble_reader_architecture_prompt
from hive_agents.reader_prompt.constants import PROMPT_VERSION
from hive_agents.settings import Settings


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
    parallel_p6 = assemble_reader_architecture_prompt(
        "parallel_document", pack=iep_pack, parallel_prompt_variant="p6"
    )
    assert case.prompt_sha256 == payload["case_wide_sha256"]
    assert parallel.prompt_sha256 == payload["parallel_document_sha256"]
    assert parallel_p6.prompt_sha256 == payload["parallel_document_p6_sha256"]
    assert parallel.prompt_sha256 != parallel_p6.prompt_sha256


def test_resolve_reader_stable_system_for_request_b_p6_runtime(iep_pack) -> None:
    """Regression: B-P6 path must not NameError; stable prefix SHA matches committed pin."""
    repo = Path(__file__).resolve().parents[2]
    hashes_path = repo / "engine" / "eval" / "reports" / "reader-experiment" / "prompt-hashes.json"
    payload = json.loads(hashes_path.read_text(encoding="utf-8"))
    expected_p6 = "3b671c93576d081e0b1033c514d2c2ab356150e72f8c25d24fc8d0f08057e36e"
    assert payload["parallel_document_p6_sha256"] == expected_p6

    settings_b_p6 = Settings(
        _env_file=None,
        reader_architecture_variant="parallel_document",
        reader_parallel_prompt_variant="p6",
    )
    stable_p6, manifest_p6 = resolve_reader_stable_system_for_request(
        iep_pack, settings=settings_b_p6
    )
    assert stable_p6.strip()
    assert manifest_p6 is not None
    assert hashlib.sha256(stable_p6.encode("utf-8")).hexdigest() == expected_p6

    settings_b = Settings(
        _env_file=None,
        reader_architecture_variant="parallel_document",
    )
    stable_b, _ = resolve_reader_stable_system_for_request(iep_pack, settings=settings_b)
    assert hashlib.sha256(stable_b.encode("utf-8")).hexdigest() == payload["parallel_document_sha256"]

    settings_a2 = Settings(
        _env_file=None,
        reader_architecture_variant="case_wide",
    )
    stable_a2, _ = resolve_reader_stable_system_for_request(iep_pack, settings=settings_a2)
    assert hashlib.sha256(stable_a2.encode("utf-8")).hexdigest() == payload["case_wide_sha256"]
