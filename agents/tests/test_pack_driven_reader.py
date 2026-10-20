from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from hive_agents import settings as agent_settings
from hive_agents.pack_loader import load_agent_pack
from hive_agents.pack_driven_reader.adapter import (
    compile_pack_driven_reader_prompt,
    default_iep_v03_proposed_pack_path,
    load_proposal_domain_pack,
)
from hive_agents.reader import build_reader_stable_system


def _repo_root() -> Path:
    return agent_settings.repo_root_from_module_file(agent_settings.__file__)


@pytest.fixture(scope="module")
def iep_v03_pack() -> dict:
    path = default_iep_v03_proposed_pack_path(_repo_root())
    return load_proposal_domain_pack(path)


def test_compile_pack_driven_reader_prompt_via_node(iep_v03_pack: dict) -> None:
    compiled = compile_pack_driven_reader_prompt(
        pack=iep_v03_pack,
        case_manifest=[
            {
                "sourceDocumentId": "doc-a",
                "filename": "plan.pdf",
                "pageCount": 1,
                "discoverDocumentTypeId": "iep.plan",
                "discoverDocumentTypeLabel": "iep.plan",
            }
        ],
        source_document_id="doc-a",
        pages=[{"pageNumber": 1, "text": "Offline synthetic page for compiler bridge test."}],
    )
    assert compiled.pack_document_type_count > 8
    assert compiled.pack_record_type_count > 20
    assert compiled.prompt_version == "hive-pack-driven-reader/0.3.0"
    schema_text = json.dumps(compiled.output_json_schema)
    assert "hive.pack-driven-reader-extraction/0.3.0" in schema_text
    assert "hive.pack-driven-reader-extraction/0.3.0" in compiled.blocks["F_outputContract"]
    assert "insightChecks" not in compiled.stable_system_prefix
    assert "Document-type catalog" in compiled.stable_system_prefix


def test_production_reader_stable_system_unchanged() -> None:
    pack = load_agent_pack()
    stable = build_reader_stable_system(pack)
    digest = hashlib.sha256(stable.encode("utf-8")).hexdigest()
    assert len(stable) > 200
    assert "## Domain pack reader instructions" in stable
    assert digest == "7655584ec86a5417556e85435c67fc2d56d803b886729a298b1ad6db8050890d"
