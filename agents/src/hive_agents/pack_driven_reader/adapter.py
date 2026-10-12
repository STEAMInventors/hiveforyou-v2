from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from hive_agents.lm import build_dspy_lm_messages, normalize_model_usage
from hive_agents.pack_driven_reader.compiler_bridge import (
    PackDrivenReaderCompileResult,
    PackDrivenReaderCompilerError,
    compile_pack_driven_reader_prompt_via_node,
)
from hive_agents.reader import StablePrefixLM, page_plain_text
from hive_agents import settings as agent_settings


@dataclass(frozen=True)
class PackDrivenReaderDiagnostics:
    input_tokens: int | None
    output_tokens: int | None
    cache_creation_input_tokens: int | None
    cache_read_input_tokens: int | None
    model_name: str | None
    pack_hash: str
    prompt_version: str


def default_iep_v03_proposed_pack_path(repo_root: Path | None = None) -> Path:
    root = repo_root if repo_root is not None else agent_settings.repo_root_from_module_file(agent_settings.__file__)
    return root / "brain" / "domain-packs" / "iep" / "iep-pack.v0.3.proposed.json"


def load_proposal_domain_pack(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def compile_pack_driven_reader_prompt(
    *,
    pack: Mapping[str, Any],
    case_manifest: list[Mapping[str, Any]],
    source_document_id: str,
    pages: list[Mapping[str, Any]],
) -> PackDrivenReaderCompileResult:
    payload = {
        "pack": pack,
        "caseManifest": case_manifest,
        "document": {
            "sourceDocumentId": source_document_id,
            "pages": pages,
        },
        "emitCacheBoundaryHints": True,
    }
    return compile_pack_driven_reader_prompt_via_node(payload)


def build_pack_driven_lm_messages(
    compiled: PackDrivenReaderCompileResult,
) -> list[dict[str, str]]:
    """Stable prefix = universal + pack catalog; user = manifest + task + this document only."""
    return build_dspy_lm_messages(
        stable_system=compiled.stable_system_prefix,
        case_user_content=compiled.case_user_content,
    )


def wrap_lm_for_pack_driven_experiment(lm: Any, compiled: PackDrivenReaderCompileResult) -> StablePrefixLM:
    return StablePrefixLM(lm, compiled.stable_system_prefix)


def pages_to_pack_driven_payload(pages: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "pageNumber": page.pageNumber,
            "text": page_plain_text(page),
        }
        for page in pages
    ]


def pack_driven_reader_diagnostics_from_usage(
    *,
    usage: Mapping[str, Any] | None,
    model_name: str | None,
    compiled: PackDrivenReaderCompileResult,
) -> PackDrivenReaderDiagnostics:
    normalized = normalize_model_usage(usage or {})
    return PackDrivenReaderDiagnostics(
        input_tokens=normalized.get("input_tokens"),
        output_tokens=normalized.get("output_tokens"),
        cache_creation_input_tokens=normalized.get("cache_creation_input_tokens"),
        cache_read_input_tokens=normalized.get("cache_read_input_tokens"),
        model_name=model_name,
        pack_hash=compiled.pack_content_sha256,
        prompt_version=compiled.prompt_version,
    )


__all__ = [
    "PackDrivenReaderCompileResult",
    "PackDrivenReaderCompilerError",
    "PackDrivenReaderDiagnostics",
    "build_pack_driven_lm_messages",
    "compile_pack_driven_reader_prompt",
    "default_iep_v03_proposed_pack_path",
    "load_proposal_domain_pack",
    "pack_driven_reader_diagnostics_from_usage",
    "pages_to_pack_driven_payload",
    "wrap_lm_for_pack_driven_experiment",
]
