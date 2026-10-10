import json
from pathlib import Path

import pytest

from hive_agents.pack_loader import STUDY_AGENT_ROLES, AgentPack, load_agent_pack
from hive_agents import settings as settings_module
from hive_agents.settings import (
    STUDY_AGENTS_EXPORT_SCHEMA_VERSION,
    default_study_agents_json_path,
)

IEP_AGENTS_JSON = default_study_agents_json_path(
    settings_module.repo_root_from_module_file(settings_module.__file__),
    "iep",
)


def test_iep_exported_agents_json_exists() -> None:
    assert IEP_AGENTS_JSON.is_file(), (
        f"Run `pnpm pack:export iep` first; expected artifact at {IEP_AGENTS_JSON}"
    )


def test_load_real_iep_artifact() -> None:
    pack = load_agent_pack(IEP_AGENTS_JSON)
    assert isinstance(pack, AgentPack)


def test_iep_metadata_matches_artifact() -> None:
    pack = load_agent_pack(IEP_AGENTS_JSON)
    raw = json.loads(IEP_AGENTS_JSON.read_text(encoding="utf-8"))
    assert pack.schemaVersion == STUDY_AGENTS_EXPORT_SCHEMA_VERSION
    assert pack.schemaVersion == raw["schemaVersion"]
    assert pack.domainId == "iep"
    assert pack.domainId == raw["domainId"]
    assert pack.domainPackId == "hive.domain.iep"
    assert pack.domainPackId == raw["domainPackId"]
    assert pack.domainPackVersion == "0.0.0-scaffold"
    assert pack.domainPackVersion == raw["domainPackVersion"]


def test_all_agent_instruction_keys_accessible() -> None:
    pack = load_agent_pack(IEP_AGENTS_JSON)
    for role in STUDY_AGENT_ROLES:
        text = getattr(pack.agents, role)
        assert isinstance(text, str)
        assert text.strip()


def test_load_default_path_without_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HIVE_AGENTS_JSON", raising=False)
    from hive_agents.settings import get_settings

    get_settings.cache_clear()
    pack = load_agent_pack()
    assert pack.domainId == "iep"
    get_settings.cache_clear()


def test_missing_file_fails(tmp_path: Path) -> None:
    missing = tmp_path / "no-agents.json"
    with pytest.raises(FileNotFoundError, match="not found"):
        load_agent_pack(missing)


def test_malformed_json_fails(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text("{ not valid json", encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed JSON"):
        load_agent_pack(bad)


def test_missing_required_field_fails(tmp_path: Path) -> None:
    raw = json.loads(IEP_AGENTS_JSON.read_text(encoding="utf-8"))
    del raw["domainPackVersion"]
    incomplete = tmp_path / "incomplete.json"
    incomplete.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="contract validation"):
        load_agent_pack(incomplete)


def test_empty_agent_role_fails(tmp_path: Path) -> None:
    raw = json.loads(IEP_AGENTS_JSON.read_text(encoding="utf-8"))
    raw["agents"]["reader"] = "   "
    bad = tmp_path / "empty-role.json"
    bad.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="contract validation"):
        load_agent_pack(bad)


def test_unsupported_schema_version_fails(tmp_path: Path) -> None:
    raw = json.loads(IEP_AGENTS_JSON.read_text(encoding="utf-8"))
    raw["schemaVersion"] = "study-agents/99"
    bad = tmp_path / "bad-schema.json"
    bad.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="contract validation"):
        load_agent_pack(bad)


def test_legacy_study_agents_export_without_reader_coverage_loads(tmp_path: Path) -> None:
    raw = json.loads(IEP_AGENTS_JSON.read_text(encoding="utf-8"))
    del raw["readerCoverage"]
    legacy = tmp_path / "legacy-agents.json"
    legacy.write_text(json.dumps(raw), encoding="utf-8")
    pack = load_agent_pack(legacy)
    assert pack.domainId == "iep"
    assert pack.readerCoverage.documentTypes == []
    assert pack.readerCoverage.vocabulary == []
    assert pack.agents.reader.strip()
