from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from hive_agents import settings as agent_settings
from hive_agents.api_models import StudyReaderRequest
from hive_agents.pack_driven_reader.resolve_proposal_pack import (
    PackNotAvailableError,
    ProposalPackIdentity,
    _identity_from_request,
    resolve_and_load_proposal_domain_pack,
)


def _repo_root() -> Path:
    return agent_settings.repo_root_from_module_file(agent_settings.__file__)


def _iep_default_snapshot_hash() -> str:
    from hive_agents.pack_driven_reader.resolve_proposal_pack import (
        IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
    )

    return IEP_CANDIDATE_READER_PACK_CONTENT_SHA256


def _sample_documents() -> list[dict[str, object]]:
    return [
        {
            "sourceDocumentId": "doc-a",
            "pages": [{"pageNumber": 1, "words": [{"seq": 0, "text": "Goal"}]}],
        }
    ]


def test_study_reader_request_requires_pack_identity_for_pack_driven() -> None:
    with pytest.raises(ValidationError):
        StudyReaderRequest.model_validate(
            {
                "caseId": "case-1",
                "userId": "user-1",
                "domainId": "iep",
                "studyRunId": "33333333-3333-4333-8333-333333333333",
                "attemptId": "55555555-5555-4555-8555-555555555555",
                "readerMode": "pack_driven",
                "documents": _sample_documents(),
            }
        )


def test_study_reader_request_rejects_pack_id_domain_mismatch() -> None:
    with pytest.raises(ValidationError):
        StudyReaderRequest.model_validate(
            {
                "caseId": "case-1",
                "userId": "user-1",
                "domainId": "iep",
                "packId": "medicaid",
                "packVersion": "0.3.0-proposed",
                "packContentSha256": _iep_default_snapshot_hash(),
                "studyRunId": "33333333-3333-4333-8333-333333333333",
                "attemptId": "55555555-5555-4555-8555-555555555555",
                "readerMode": "pack_driven",
                "documents": _sample_documents(),
            }
        )


def test_load_snapshot_with_requested_identity() -> None:
    from hive_agents.settings import Settings

    snapshot_hash = _iep_default_snapshot_hash()
    settings = Settings(domain_packs_brain_dir=_repo_root() / "brain" / "domain-packs")
    identity = ProposalPackIdentity(
        pack_id="iep",
        pack_version="0.3.0-proposed",
        pack_content_sha256=snapshot_hash,
    )
    loaded = resolve_and_load_proposal_domain_pack(
        domain_id="iep",
        settings=settings,
        requested_identity=identity,
    )
    assert loaded.content_sha256 == snapshot_hash
    assert loaded.source == "snapshot"


def test_requested_identity_wrong_hash_rejected(tmp_path: Path) -> None:
    from hive_agents.settings import Settings

    repo_root = _repo_root()
    brain_root = tmp_path / "brain" / "domain-packs"
    snapshots_dir = brain_root / "iep" / "snapshots"
    snapshots_dir.mkdir(parents=True)

    snapshot_hash = _iep_default_snapshot_hash()
    snapshot_src = repo_root / "brain" / "domain-packs" / "iep" / "snapshots" / f"{snapshot_hash}.json"
    (snapshots_dir / f"{snapshot_hash}.json").write_text(
        snapshot_src.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
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
    wrong = ProposalPackIdentity(
        pack_id="iep",
        pack_version="0.3.0-proposed",
        pack_content_sha256="b" * 64,
    )
    with pytest.raises(PackNotAvailableError):
        resolve_and_load_proposal_domain_pack(
            domain_id="iep",
            settings=settings,
            requested_identity=wrong,
        )


def test_identity_from_request_rejects_invalid_hash() -> None:
    with pytest.raises(PackNotAvailableError):
        _identity_from_request(
            domain_id="iep",
            pack_id="iep",
            pack_version="0.3.0-proposed",
            pack_content_sha256="not-a-hash",
        )


def test_requested_identity_is_not_replaced_by_manifest_default(tmp_path: Path) -> None:
    from hive_agents.settings import Settings

    repo_root = _repo_root()
    brain_root = tmp_path / "brain" / "domain-packs"
    snapshots_dir = brain_root / "iep" / "snapshots"
    snapshots_dir.mkdir(parents=True)

    snapshot_hash = _iep_default_snapshot_hash()
    snapshot_src = repo_root / "brain" / "domain-packs" / "iep" / "snapshots" / f"{snapshot_hash}.json"
    (snapshots_dir / f"{snapshot_hash}.json").write_text(
        snapshot_src.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
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
    identity = ProposalPackIdentity(
        pack_id="iep",
        pack_version="0.3.0-proposed",
        pack_content_sha256=snapshot_hash,
    )
    loaded = resolve_and_load_proposal_domain_pack(
        domain_id="iep",
        settings=settings,
        requested_identity=identity,
    )
    assert loaded.content_sha256 == snapshot_hash
