from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from hive_agents import settings as agent_settings
from hive_agents.pack_driven_reader.adapter import (
    default_iep_v03_proposed_pack_path,
    load_proposal_domain_pack,
)
from hive_agents.pack_driven_reader.compiler_bridge import (
    PackDrivenReaderCompilerError,
    _invoke_bridge,
)

MANIFEST_SCHEMA = "hive.domain-pack.proposal-snapshots/1"
SHA256_HEX = re.compile(r"^[a-f0-9]{64}$")

# DP-03B candidate Reader proposal pack digest (matches engine/core resolve-canonical-study-interpretation.ts).
IEP_CANDIDATE_READER_PACK_CONTENT_SHA256 = (
    "b1bafe209b771a10b55cebd3bf745e476e77e1bcaf3c3cf051aa022ef719f757"
)


class PackNotAvailableError(RuntimeError):
    def __init__(self, message: str, *, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self.diagnostics = diagnostics


@dataclass(frozen=True)
class ProposalPackIdentity:
    pack_id: str
    pack_version: str
    pack_content_sha256: str


@dataclass(frozen=True)
class ResolvedProposalDomainPack:
    pack: dict[str, Any]
    path: Path
    content_sha256: str
    source: str


def _repo_root(repo_root: Path | None) -> Path:
    return repo_root if repo_root is not None else agent_settings.repo_root_from_module_file(
        agent_settings.__file__
    )


def resolved_domain_packs_brain_dir(settings: Any, repo_root: Path | None = None) -> Path:
    override = getattr(settings, "domain_packs_brain_dir", None)
    if override is not None:
        return Path(override).expanduser().resolve()
    return _repo_root(repo_root) / "brain" / "domain-packs"


def proposal_pack_snapshots_dir(pack_id: str, settings: Any, repo_root: Path | None = None) -> Path:
    scoped = getattr(settings, "proposal_pack_snapshots_dir", None)
    if scoped is not None:
        return Path(scoped).expanduser().resolve()
    return resolved_domain_packs_brain_dir(settings, repo_root) / pack_id / "snapshots"


def proposal_pack_snapshot_path_for_hash(
    content_sha256: str,
    *,
    pack_id: str,
    settings: Any,
    repo_root: Path | None = None,
) -> Path:
    normalized = content_sha256.strip().lower()
    return proposal_pack_snapshots_dir(pack_id, settings, repo_root) / f"{normalized}.json"


def _read_snapshot_manifest(domain_id: str, settings: Any, repo_root: Path | None) -> dict[str, Any] | None:
    manifest_path = (
        resolved_domain_packs_brain_dir(settings, repo_root) / domain_id / "snapshots" / "manifest.json"
    )
    if not manifest_path.is_file():
        return None
    try:
        parsed = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PackNotAvailableError(
            f"Invalid proposal pack snapshot manifest: {manifest_path}",
            diagnostics={"manifestPath": str(manifest_path), "error": str(exc)},
        ) from exc
    if not isinstance(parsed, dict):
        raise PackNotAvailableError(
            f"Invalid proposal pack snapshot manifest shape: {manifest_path}",
            diagnostics={"manifestPath": str(manifest_path)},
        )
    if parsed.get("schemaVersion") != MANIFEST_SCHEMA:
        raise PackNotAvailableError(
            f"Unsupported proposal pack snapshot manifest schema: {manifest_path}",
            diagnostics={"manifestPath": str(manifest_path)},
        )
    snapshots = parsed.get("snapshots")
    if not isinstance(snapshots, list):
        raise PackNotAvailableError(
            f"Invalid proposal pack snapshot manifest entries: {manifest_path}",
            diagnostics={"manifestPath": str(manifest_path)},
        )
    return parsed


def _identity_from_manifest_entry(entry: dict[str, Any], *, domain_id: str) -> ProposalPackIdentity:
    pack_id = str(entry.get("packId", domain_id)).strip() or domain_id.strip()
    pack_version = str(entry.get("packVersion", "")).strip()
    pack_hash = str(entry.get("packContentSha256", "")).strip().lower()
    if not pack_version or not SHA256_HEX.match(pack_hash):
        raise PackNotAvailableError(
            "Proposal pack snapshot manifest entry is incomplete.",
            diagnostics={"domainId": domain_id},
        )
    return ProposalPackIdentity(
        pack_id=pack_id,
        pack_version=pack_version,
        pack_content_sha256=pack_hash,
    )


def _resolve_default_proposal_pack_from_pool(
    *,
    domain_id: str,
    pool: list[dict[str, Any]],
) -> ProposalPackIdentity:
    if len(pool) == 1:
        return _identity_from_manifest_entry(pool[0], domain_id=domain_id)
    if domain_id.strip() == "iep":
        for entry in pool:
            entry_hash = str(entry.get("packContentSha256", "")).strip().lower()
            if entry_hash == IEP_CANDIDATE_READER_PACK_CONTENT_SHA256:
                return _identity_from_manifest_entry(entry, domain_id=domain_id)
    raise PackNotAvailableError(
        "Ambiguous or missing proposal pack snapshot identity; configure pack content hash.",
        diagnostics={
            "domainId": domain_id,
            "manifestEntryCount": len(pool),
            "matchingEntryCount": len(pool),
        },
    )


def resolve_proposal_pack_identity(
    *,
    domain_id: str,
    settings: Any,
    repo_root: Path | None = None,
) -> ProposalPackIdentity:
    configured_hash = getattr(settings, "pack_driven_reader_pack_content_sha256", None)
    configured_pack_id = getattr(settings, "pack_driven_reader_pack_id", None)
    configured_pack_version = getattr(settings, "pack_driven_reader_pack_version", None)

    if configured_hash:
        normalized_hash = str(configured_hash).strip().lower()
        if not SHA256_HEX.match(normalized_hash):
            raise PackNotAvailableError(
                "Configured pack content hash is invalid.",
                diagnostics={"packContentSha256": configured_hash},
            )
        pack_id = (
            str(configured_pack_id).strip()
            if configured_pack_id
            else domain_id.strip()
        )
        pack_version = str(configured_pack_version).strip() if configured_pack_version else ""
        if not pack_version:
            manifest = _read_snapshot_manifest(domain_id, settings, repo_root)
            if manifest:
                for entry in manifest.get("snapshots", []):
                    if not isinstance(entry, dict):
                        continue
                    entry_hash = str(entry.get("packContentSha256", "")).strip().lower()
                    if entry_hash == normalized_hash:
                        pack_version = str(entry.get("packVersion", "")).strip()
                        pack_id = str(entry.get("packId", pack_id)).strip() or pack_id
                        break
        if not pack_version:
            raise PackNotAvailableError(
                "Pack version is required when resolving by content hash.",
                diagnostics={
                    "domainId": domain_id,
                    "packContentSha256": normalized_hash,
                },
            )
        return ProposalPackIdentity(
            pack_id=pack_id,
            pack_version=pack_version,
            pack_content_sha256=normalized_hash,
        )

    manifest = _read_snapshot_manifest(domain_id, settings, repo_root)
    if manifest:
        entries = [entry for entry in manifest.get("snapshots", []) if isinstance(entry, dict)]
        matching = [
            entry
            for entry in entries
            if str(entry.get("packId", "")).strip() == domain_id.strip()
            or not str(entry.get("packId", "")).strip()
        ]
        pool = matching if matching else entries
        if configured_pack_version:
            version = str(configured_pack_version).strip()
            pool = [entry for entry in pool if str(entry.get("packVersion", "")).strip() == version]
        return _resolve_default_proposal_pack_from_pool(domain_id=domain_id, pool=pool)

    # Local development fallback: mutable proposed JSON (no snapshot registry).
    proposed_path = default_iep_v03_proposed_pack_path(_repo_root(repo_root))
    if domain_id.strip() != "iep" or not proposed_path.is_file():
        raise PackNotAvailableError(
            f"No proposal pack snapshot registry is available for domain {domain_id}.",
            diagnostics={"domainId": domain_id},
        )
    pack = load_proposal_domain_pack(proposed_path)
    content_sha256 = _hash_proposal_pack_via_node(pack, repo_root=repo_root)
    manifest = pack.get("manifest")
    if not isinstance(manifest, dict):
        raise PackNotAvailableError(
            "Development proposal pack is missing manifest metadata.",
            diagnostics={"path": str(proposed_path)},
        )
    return ProposalPackIdentity(
        pack_id=str(manifest.get("id", domain_id)).strip() or domain_id.strip(),
        pack_version=str(manifest.get("version", "")).strip(),
        pack_content_sha256=content_sha256,
    )


def collect_proposal_pack_candidate_paths(
    identity: ProposalPackIdentity,
    settings: Any,
    repo_root: Path | None = None,
) -> list[Path]:
    paths: list[Path] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        key = str(path)
        if key not in seen:
            seen.add(key)
            paths.append(path)

    override = getattr(settings, "pack_driven_reader_proposal_json", None)
    if override is not None:
        add(Path(override).expanduser().resolve())

    snapshots_dir = proposal_pack_snapshots_dir(identity.pack_id, settings, repo_root)
    add(proposal_pack_snapshot_path_for_hash(
        identity.pack_content_sha256,
        pack_id=identity.pack_id,
        settings=settings,
        repo_root=repo_root,
    ))
    versioned = (
        snapshots_dir
        / f"{identity.pack_id}@{identity.pack_version}.{identity.pack_content_sha256}.json"
    )
    add(versioned)

    if snapshots_dir.is_dir():
        for entry in snapshots_dir.iterdir():
            if not entry.is_file() or entry.name == "manifest.json" or not entry.name.endswith(".json"):
                continue
            if identity.pack_content_sha256 in entry.name.lower():
                add(entry.resolve())

    return paths


def _hash_proposal_pack_via_node(pack: dict[str, Any], *, repo_root: Path | None) -> str:
    try:
        raw = _invoke_bridge({"op": "hash", "pack": pack}, repo_root=repo_root)
    except PackDrivenReaderCompilerError as exc:
        raise PackNotAvailableError(
            "Proposal pack hash bridge failed.",
            diagnostics={"error": str(exc)},
        ) from exc
    if not raw.get("valid"):
        errors = raw.get("errors")
        raise PackNotAvailableError(
            "Proposal pack failed structural validation.",
            diagnostics={"errors": errors if isinstance(errors, list) else []},
        )
    content_sha256 = str(raw.get("packContentSha256", "")).strip().lower()
    if not SHA256_HEX.match(content_sha256):
        raise PackNotAvailableError(
            "Proposal pack hash bridge returned an invalid digest.",
            diagnostics={},
        )
    return content_sha256


def _try_load_strict_snapshot(
    path: Path,
    identity: ProposalPackIdentity,
    settings: Any,
    repo_root: Path | None,
) -> ResolvedProposalDomainPack | None:
    if not path.is_file():
        return None
    try:
        pack = load_proposal_domain_pack(path)
    except (OSError, json.JSONDecodeError):
        return None

    manifest = pack.get("manifest")
    if not isinstance(manifest, dict):
        return None
    if str(manifest.get("id", "")).strip() != identity.pack_id:
        return None
    if str(manifest.get("version", "")).strip() != identity.pack_version:
        return None

    try:
        content_sha256 = _hash_proposal_pack_via_node(pack, repo_root=repo_root)
    except PackNotAvailableError:
        return None
    if content_sha256 != identity.pack_content_sha256:
        return None

    override = getattr(settings, "pack_driven_reader_proposal_json", None)
    if override is not None and path.resolve() == Path(override).expanduser().resolve():
        source = "override"
    elif path.name.lower() == f"{identity.pack_content_sha256}.json":
        source = "snapshot"
    else:
        source = "override"

    return ResolvedProposalDomainPack(
        pack=pack,
        path=path.resolve(),
        content_sha256=content_sha256,
        source=source,
    )




def _identity_from_request(
    *,
    domain_id: str,
    pack_id: str,
    pack_version: str,
    pack_content_sha256: str,
) -> ProposalPackIdentity:
    normalized_domain = domain_id.strip()
    normalized_pack_id = pack_id.strip()
    normalized_version = pack_version.strip()
    normalized_hash = pack_content_sha256.strip().lower()
    if not normalized_pack_id or not normalized_version:
        raise PackNotAvailableError(
            'Reader request proposal pack identity is incomplete.',
            diagnostics={'domainId': normalized_domain},
        )
    if not SHA256_HEX.match(normalized_hash):
        raise PackNotAvailableError(
            'Reader request packContentSha256 is invalid.',
            diagnostics={'packContentSha256': pack_content_sha256},
        )
    if normalized_pack_id != normalized_domain:
        raise PackNotAvailableError(
            'Reader request packId does not match domainId.',
            diagnostics={'domainId': normalized_domain, 'packId': normalized_pack_id},
        )
    return ProposalPackIdentity(
        pack_id=normalized_pack_id,
        pack_version=normalized_version,
        pack_content_sha256=normalized_hash,
    )
def resolve_and_load_proposal_domain_pack(
    *,
    domain_id: str,
    settings: Any,
    repo_root: Path | None = None,
    requested_identity: ProposalPackIdentity | None = None,
) -> ResolvedProposalDomainPack:
    if requested_identity is not None:
        identity = requested_identity
        if identity.pack_id.strip() != domain_id.strip():
            raise PackNotAvailableError(
                'Reader request packId does not match domainId.',
                diagnostics={'domainId': domain_id, 'packId': identity.pack_id},
            )
    else:
        identity = resolve_proposal_pack_identity(
            domain_id=domain_id,
            settings=settings,
            repo_root=repo_root,
        )
    candidate_paths = collect_proposal_pack_candidate_paths(
        identity,
        settings,
        repo_root=repo_root,
    )
    expected_snapshot_path = proposal_pack_snapshot_path_for_hash(
        identity.pack_content_sha256,
        pack_id=identity.pack_id,
        settings=settings,
        repo_root=repo_root,
    )

    for path in candidate_paths:
        loaded = _try_load_strict_snapshot(path, identity, settings, repo_root)
        if loaded is not None:
            return loaded

    raise PackNotAvailableError(
        (
            f"Matching proposal Domain Pack is unavailable for "
            f"{identity.pack_id}@{identity.pack_version} "
            f"(hash {identity.pack_content_sha256})."
        ),
        diagnostics={
            "domainId": domain_id,
            "packId": identity.pack_id,
            "packVersion": identity.pack_version,
            "packContentSha256": identity.pack_content_sha256,
            "candidatePaths": [str(path) for path in candidate_paths],
            "expectedSnapshotPath": str(expected_snapshot_path),
        },
    )


__all__ = [
    "PackNotAvailableError",
    "ProposalPackIdentity",
    "ResolvedProposalDomainPack",
    "collect_proposal_pack_candidate_paths",
    "proposal_pack_snapshot_path_for_hash",
    "resolve_and_load_proposal_domain_pack",
    "resolve_proposal_pack_identity",
]
