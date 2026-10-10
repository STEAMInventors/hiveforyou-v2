from __future__ import annotations

import hashlib
from dataclasses import dataclass

from hive_agents.pack_loader import AgentPack
from hive_agents.reader import reader_instructions_from_pack
from hive_agents.reader_prompt.constants import PROMPT_VERSION, READER_ARCHITECTURE_VARIANTS
from hive_agents.reader_prompt.golden_reference import golden_reference_methodology_for_reader
from hive_agents.reader_prompt.sections_shared import (
    shared_sections_after_checklist,
    shared_sections_before_golden_methodology,
)
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta, format_trusted_manifest_block


@dataclass(frozen=True)
class AssembledReaderExperimentPrompt:
    architecture: str
    prompt_version: str
    prompt_sha256: str
    stable_system_prefix: str
    trusted_manifest_block: str


def assemble_reader_architecture_prompt(
    architecture: str,
    *,
    pack: AgentPack,
    trusted_documents: list[TrustedDocumentMeta] | None = None,
    engine1_context_block: str | None = None,
) -> AssembledReaderExperimentPrompt:
    normalized = architecture.strip()
    if normalized not in READER_ARCHITECTURE_VARIANTS:
        raise ValueError(
            f"architecture must be one of {sorted(READER_ARCHITECTURE_VARIANTS)} (got {architecture!r})"
        )

    pack_reader = reader_instructions_from_pack(pack)
    pack_header = (
        f"Domain pack: domainId={pack.domainId} "
        f"domainPackId={pack.domainPackId} domainPackVersion={pack.domainPackVersion}\n\n"
        f"## Domain pack reader instructions\n\n{pack_reader.strip()}"
    )
    shared_before = shared_sections_before_golden_methodology(architecture=normalized)
    golden_body = golden_reference_methodology_for_reader()
    shared_after = shared_sections_after_checklist()

    stable = "\n\n".join([pack_header, shared_before, golden_body, shared_after])
    manifest_parts = []
    if engine1_context_block and engine1_context_block.strip():
        manifest_parts.append(engine1_context_block.strip())
    manifest_parts.append(format_trusted_manifest_block(trusted_documents or []))
    manifest_block = "\n\n".join(manifest_parts)

    digest = hashlib.sha256(stable.encode("utf-8")).hexdigest()
    version = f"{PROMPT_VERSION}+architecture/{normalized}"
    return AssembledReaderExperimentPrompt(
        architecture=normalized,
        prompt_version=version,
        prompt_sha256=digest,
        stable_system_prefix=stable,
        trusted_manifest_block=manifest_block,
    )


def append_untrusted_manifest_to_case_user(case_user_content: str, manifest_block: str) -> str:
    if not manifest_block.strip():
        return case_user_content
    return f"{manifest_block}\n\n--- UNTRUSTED_DOCUMENT_BUNDLE ---\n{case_user_content}"


# Backward-compatible name for tests migrating off prompt A/B.
assemble_reader_experiment_prompt = assemble_reader_architecture_prompt
