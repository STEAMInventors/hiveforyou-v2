from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from hive_agents import settings as agent_settings


class PackDrivenReaderCompilerError(RuntimeError):
    pass


@dataclass(frozen=True)
class PackDrivenReaderCompileResult:
    prompt_version: str
    pack_id: str
    pack_version: str
    pack_content_sha256: str
    pack_document_type_count: int
    pack_record_type_count: int
    stable_system_prefix: str
    case_user_content: str
    output_json_schema: dict[str, Any]
    blocks: Mapping[str, str]


@dataclass(frozen=True)
class PackDrivenReaderParseResult:
    ok: bool
    needs_review: bool
    document_type_id: str | None
    document_type_resolved: str | None
    errors: list[str]
    record_instances: list[dict[str, Any]]


def _repo_root(repo_root: Path | None) -> Path:
    return repo_root if repo_root is not None else agent_settings.repo_root_from_module_file(
        agent_settings.__file__
    )


def _compiler_cli_path(repo_root: Path) -> Path:
    env_override = os.environ.get("HIVE_PACK_DRIVEN_READER_COMPILER_JS", "").strip()
    if env_override:
        return Path(env_override).expanduser().resolve()
    bundled = repo_root / "engine" / "domain-pack" / "dist" / "pack-driven-reader-bridge.mjs"
    if bundled.is_file():
        return bundled
    return repo_root / "engine" / "domain-pack" / "scripts" / "pack-driven-reader-bridge-stdin.ts"


def _invoke_bridge(payload: Mapping[str, Any], *, repo_root: Path | None = None) -> dict[str, Any]:
    root = _repo_root(repo_root)
    cli = _compiler_cli_path(root)
    if not cli.is_file():
        raise PackDrivenReaderCompilerError(f"Compiler bridge missing: {cli}")

    if cli.suffix == ".ts":
        pnpm = shutil.which("pnpm")
        if pnpm is None:
            raise PackDrivenReaderCompilerError(
                "pnpm not found; build engine/domain-pack/dist/pack-driven-reader-bridge.mjs "
                "or set HIVE_PACK_DRIVEN_READER_COMPILER_JS",
            )
        cmd = [pnpm, "exec", "tsx", str(cli)]
        cwd = str(root)
    else:
        node = shutil.which("node")
        if node is None:
            raise PackDrivenReaderCompilerError("node not found; cannot invoke pack-driven compiler bridge")
        cmd = [node, str(cli)]
        cwd = str(root)

    proc = subprocess.run(
        cmd,
        input=json.dumps(payload).encode("utf-8"),
        cwd=cwd,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")
        raise PackDrivenReaderCompilerError(f"pack-driven bridge failed: {stderr.strip()}")

    raw = json.loads(proc.stdout.decode("utf-8"))
    if not isinstance(raw, dict):
        raise PackDrivenReaderCompilerError("pack-driven bridge returned non-object JSON")
    return raw


def compile_pack_driven_reader_prompt_via_node(
    payload: Mapping[str, Any],
    *,
    repo_root: Path | None = None,
) -> PackDrivenReaderCompileResult:
    raw = _invoke_bridge({"op": "compile", **dict(payload)}, repo_root=repo_root)
    return PackDrivenReaderCompileResult(
        prompt_version=str(raw["promptVersion"]),
        pack_id=str(raw["packId"]),
        pack_version=str(raw["packVersion"]),
        pack_content_sha256=str(raw["packContentSha256"]),
        pack_document_type_count=int(raw["packDocumentTypeCount"]),
        pack_record_type_count=int(raw["packRecordTypeCount"]),
        stable_system_prefix=str(raw["stableSystemPrefix"]),
        case_user_content=str(raw["caseUserContent"]),
        output_json_schema=dict(raw["outputJsonSchema"]),
        blocks=dict(raw["blocks"]),
    )


def parse_pack_driven_extraction_via_node(
    *,
    pack: Mapping[str, Any],
    raw: Mapping[str, Any],
    expected_source_document_id: str,
    repo_root: Path | None = None,
) -> PackDrivenReaderParseResult:
    payload = {
        "op": "parse",
        "pack": pack,
        "raw": raw,
        "expectedSourceDocumentId": expected_source_document_id,
    }
    parsed = _invoke_bridge(payload, repo_root=repo_root)
    errors = parsed.get("errors")
    record_instances = parsed.get("recordInstances")
    document_type_id = parsed.get("documentTypeId")
    return PackDrivenReaderParseResult(
        ok=bool(parsed.get("ok")),
        needs_review=bool(parsed.get("needsReview")),
        document_type_id=document_type_id if isinstance(document_type_id, str) else None,
        document_type_resolved=(
            str(parsed["documentTypeResolved"])
            if parsed.get("documentTypeResolved") is not None
            else None
        ),
        errors=list(errors) if isinstance(errors, list) else [],
        record_instances=list(record_instances) if isinstance(record_instances, list) else [],
    )
