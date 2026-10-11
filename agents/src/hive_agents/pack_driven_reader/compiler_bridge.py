from __future__ import annotations

import json
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
    document_type_id: str
    document_type_resolved: str
    selected_record_type_ids: list[str]
    selected_field_count: int
    stable_system_prefix: str
    case_user_content: str
    output_json_schema: dict[str, Any]
    blocks: Mapping[str, str]


def _compiler_cli_path(repo_root: Path) -> Path:
    return repo_root / "engine" / "domain-pack" / "scripts" / "pack-driven-reader-compile-stdin.ts"


def compile_pack_driven_reader_prompt_via_node(
    payload: Mapping[str, Any],
    *,
    repo_root: Path | None = None,
) -> PackDrivenReaderCompileResult:
    root = repo_root if repo_root is not None else agent_settings.repo_root_from_module_file(agent_settings.__file__)
    cli = _compiler_cli_path(root)
    if not cli.is_file():
        raise PackDrivenReaderCompilerError(f"Compiler CLI missing: {cli}")

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise PackDrivenReaderCompilerError("pnpm not found; cannot invoke TypeScript pack-driven compiler")

    proc = subprocess.run(
        [pnpm, "exec", "tsx", str(cli)],
        input=json.dumps(payload).encode("utf-8"),
        cwd=str(root),
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")
        raise PackDrivenReaderCompilerError(f"pack-driven compiler failed: {stderr.strip()}")

    raw = json.loads(proc.stdout.decode("utf-8"))
    return PackDrivenReaderCompileResult(
        prompt_version=str(raw["promptVersion"]),
        pack_id=str(raw["packId"]),
        pack_version=str(raw["packVersion"]),
        pack_content_sha256=str(raw["packContentSha256"]),
        document_type_id=str(raw["documentTypeId"]),
        document_type_resolved=str(raw["documentTypeResolved"]),
        selected_record_type_ids=list(raw["selectedRecordTypeIds"]),
        selected_field_count=int(raw["selectedFieldCount"]),
        stable_system_prefix=str(raw["stableSystemPrefix"]),
        case_user_content=str(raw["caseUserContent"]),
        output_json_schema=dict(raw["outputJsonSchema"]),
        blocks=dict(raw["blocks"]),
    )
