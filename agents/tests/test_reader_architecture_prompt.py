from __future__ import annotations

from pathlib import Path

import pytest

from hive_agents.pack_loader import load_agent_pack
from hive_agents.pack_loader import AgentPack, ReaderCoverageExport, StudyAgentInstructions
from hive_agents.reader_prompt.assemble import assemble_reader_architecture_prompt
from hive_agents.reader_prompt.section6_golden_inspired import (
    build_case_wide_domain_coverage_checklist,
    build_parallel_document_domain_coverage_checklist,
)
from hive_agents.reader_prompt.golden_reference import (
    golden_reference_methodology_for_reader,
    load_golden_reference_methodology_body,
)
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


def test_golden_reference_reader_adaptation_strips_proposal_output_contract() -> None:
    adapted = golden_reference_methodology_for_reader()
    assert "Do not reclassify the domain" in adapted
    assert "Voice proposal" not in adapted
    assert "## Conflicts" not in adapted
    assert "## Missing information" not in adapted
    assert "Downstream delegation (Reader)" in adapted


def test_architectures_differ_in_section_five_and_case_wide_section_six(iep_pack) -> None:
    a = assemble_reader_architecture_prompt("case_wide", pack=iep_pack)
    b = assemble_reader_architecture_prompt("parallel_document", pack=iep_pack)
    b_p6 = assemble_reader_architecture_prompt(
        "parallel_document", pack=iep_pack, parallel_prompt_variant="p6"
    )
    assert a.prompt_sha256 != b.prompt_sha256
    assert b.prompt_sha256 != b_p6.prompt_sha256
    assert "case-wide architecture" in a.stable_system_prefix
    assert "parallel-document architecture" in b.stable_system_prefix
    assert "## 6. DOMAIN-AWARE COVERAGE CHECKLIST" in a.stable_system_prefix
    assert "(case-wide)" in a.stable_system_prefix
    assert "## 6. DOMAIN-AWARE COVERAGE CHECKLIST" not in b.stable_system_prefix
    assert "(this document only)" in b_p6.stable_system_prefix
    assert "### 6.7 Final self-check" in a.stable_system_prefix
    assert "§6.7" in a.stable_system_prefix
    assert "§6.7" not in b.stable_system_prefix
    assert "§6.7" in shared_sections_after_checklist(
        architecture="parallel_document", parallel_prompt_variant="p6"
    )


def test_a2_case_wide_prompt_sha_immutable(iep_pack) -> None:
    import json
    from pathlib import Path

    repo = Path(__file__).resolve().parents[2]
    hashes_path = repo / "engine" / "eval" / "reports" / "reader-experiment" / "prompt-hashes.json"
    payload = json.loads(hashes_path.read_text(encoding="utf-8"))
    a2 = assemble_reader_architecture_prompt("case_wide", pack=iep_pack)
    assert a2.prompt_sha256 == payload["case_wide_sha256"]


def test_parallel_b_p6_document_scoped_coverage_without_cross_document_requirements(iep_pack) -> None:
    checklist = build_parallel_document_domain_coverage_checklist(iep_pack)
    assert "this document only" in checklist.lower()
    assert "Engine 1-assigned" in checklist
    assert "Do **not** require cross-document" in checklist
    assert "Do **not** invoke tools" in checklist
    assert "For **each** logical document in the trusted manifest" not in checklist
    assert "cross-document hooks" not in checklist.lower()

    assembled = assemble_reader_architecture_prompt(
        "parallel_document", pack=iep_pack, parallel_prompt_variant="p6"
    )
    assert iep_pack.readerCoverage.documentTypes[0] in assembled.stable_system_prefix
    assert "For **each** logical document again" not in assembled.stable_system_prefix


def test_case_wide_checklist_uses_pack_export_not_hardcoded_domain(iep_pack) -> None:
    checklist = build_case_wide_domain_coverage_checklist(iep_pack)
    assert iep_pack.readerCoverage.documentTypes[0] in checklist
    assert iep_pack.readerCoverage.domainLabel in checklist
    assert "`related_services`" in checklist or "related_services" in checklist
    assert "Outside pack lists" in checklist
    assert iep_pack.agents.reader.strip() not in checklist
    assert "`plaafp`" not in checklist.lower()

    module_path = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "hive_agents"
        / "reader_prompt"
        / "section6_golden_inspired.py"
    )
    source = module_path.read_text(encoding="utf-8")
    assert "IEP" not in source
    assert "PLAAFP" not in source
    assert "special education" not in source.lower()


def test_synthetic_pack_drives_checklist_without_iep_strings() -> None:
    pack = AgentPack(
        schemaVersion="study-agents/1",
        domainId="synthetic-demo",
        domainPackId="hive.domain.synthetic-demo",
        domainPackVersion="0.0.0-test",
        readerCoverage=ReaderCoverageExport(
            domainLabel="Synthetic records",
            documentTypes=["Type Alpha", "Type Beta"],
            familyRoles=["Primary record"],
            relationshipKinds=["supports"],
            focusConstructs=["alpha_measure"],
            vocabulary=[
                {
                    "termId": "alpha_term",
                    "label": "Alpha term",
                    "abbreviations": ["AT"],
                }
            ],
        ),
        agents=StudyAgentInstructions(
            intake="orient",
            reader="Extract alpha facts.\n\nCapture beta dates when stated.",
            investigator="link",
            writer="summarize",
        ),
    )
    assembled = assemble_reader_architecture_prompt("case_wide", pack=pack)
    checklist = build_case_wide_domain_coverage_checklist(pack)
    assert "Type Alpha" in assembled.stable_system_prefix
    assert "`alpha_measure`" in assembled.stable_system_prefix
    assert "Extract alpha facts." in assembled.stable_system_prefix
    assert "Extract alpha facts." not in checklist
    assert "Domain pack reader instructions" in checklist
    assert "`alpha_term`" not in checklist
    assert "IEP" not in assembled.stable_system_prefix


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
    after_case = shared_sections_after_checklist(architecture="case_wide")
    after_parallel = shared_sections_after_checklist(architecture="parallel_document")
    assert "## 7." in after_case
    assert "§6.7" in after_case
    assert "§6.7" not in after_parallel
