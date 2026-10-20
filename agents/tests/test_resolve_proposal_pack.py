from __future__ import annotations

import json
from pathlib import Path

import pytest

from hive_agents import settings as agent_settings
from hive_agents.pack_driven_reader.resolve_proposal_pack import (
    PackNotAvailableError,
    resolve_and_load_proposal_domain_pack,
    resolve_proposal_pack_identity,
)
from hive_agents.settings import Settings


def _repo_root() -> Path:
    return agent_settings.repo_root_from_module_file(agent_settings.__file__)


def _iep_default_snapshot_hash() -> str:
    from hive_agents.pack_driven_reader.resolve_proposal_pack import (
        IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
    )

    return IEP_CANDIDATE_READER_PACK_CONTENT_SHA256


def test_resolve_iep_snapshot_identity_from_manifest() -> None:
    settings = Settings(
        domain_packs_brain_dir=_repo_root() / "brain" / "domain-packs",
    )
    identity = resolve_proposal_pack_identity(domain_id="iep", settings=settings)
    assert identity.pack_id == "iep"
    assert identity.pack_version == "0.3.0-proposed"
    assert identity.pack_content_sha256 == _iep_default_snapshot_hash()


def test_load_iep_snapshot_by_manifest_identity() -> None:
    settings = Settings(
        domain_packs_brain_dir=_repo_root() / "brain" / "domain-packs",
    )
    loaded = resolve_and_load_proposal_domain_pack(domain_id="iep", settings=settings)
    assert loaded.source == "snapshot"
    assert loaded.content_sha256 == _iep_default_snapshot_hash()
    assert loaded.pack["manifest"]["id"] == "iep"


def test_hash_mismatch_is_rejected(tmp_path: Path) -> None:
    repo_root = _repo_root()
    brain_root = tmp_path / "brain" / "domain-packs"
    snapshots_dir = brain_root / "iep" / "snapshots"
    snapshots_dir.mkdir(parents=True)

    snapshot_hash = _iep_default_snapshot_hash()
    snapshot_src = repo_root / "brain" / "domain-packs" / "iep" / "snapshots" / f"{snapshot_hash}.json"
    snapshot_dst = snapshots_dir / f"{snapshot_hash}.json"
    snapshot_dst.write_text(snapshot_src.read_text(encoding="utf-8"), encoding="utf-8")

    manifest = {
        "schemaVersion": "hive.domain-pack.proposal-snapshots/1",
        "snapshots": [
            {
                "packId": "iep",
                "packVersion": "0.3.0-proposed",
                "packContentSha256": snapshot_hash,
                "path": f"{snapshot_hash}.json",
            }
        ],
    }
    (snapshots_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    settings = Settings(
        domain_packs_brain_dir=brain_root,
        pack_driven_reader_pack_content_sha256="b" * 64,
        pack_driven_reader_pack_version="0.3.0-proposed",
    )

    with pytest.raises(PackNotAvailableError) as exc_info:
        resolve_and_load_proposal_domain_pack(domain_id="iep", settings=settings)

    diagnostics = exc_info.value.diagnostics
    assert diagnostics["packContentSha256"] == "b" * 64
    assert any("b" * 64 in path for path in diagnostics["candidatePaths"])


def test_unknown_domain_without_snapshot_registry_is_rejected() -> None:
    settings = Settings(
        domain_packs_brain_dir=_repo_root() / "brain" / "domain-packs",
    )
    with pytest.raises(PackNotAvailableError, match="No proposal pack snapshot registry"):
        resolve_and_load_proposal_domain_pack(domain_id="not-a-pack-domain", settings=settings)


def test_missing_snapshot_file_is_rejected(tmp_path: Path) -> None:
    brain_root = tmp_path / "brain" / "domain-packs"
    snapshots_dir = brain_root / "iep" / "snapshots"
    snapshots_dir.mkdir(parents=True)

    snapshot_hash = _iep_default_snapshot_hash()
    manifest = {
        "schemaVersion": "hive.domain-pack.proposal-snapshots/1",
        "snapshots": [
            {
                "packId": "iep",
                "packVersion": "0.3.0-proposed",
                "packContentSha256": snapshot_hash,
                "path": f"{snapshot_hash}.json",
            }
        ],
    }
    (snapshots_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    settings = Settings(domain_packs_brain_dir=brain_root)
    with pytest.raises(PackNotAvailableError, match="Matching proposal Domain Pack is unavailable"):
        resolve_and_load_proposal_domain_pack(domain_id="iep", settings=settings)
