from __future__ import annotations

import hashlib
from dataclasses import dataclass

from hive_agents.pack_loader import AgentPack
from hive_agents.reader_prompt.constants import PROMPT_VERSION, READER_EXPERIMENT_VARIANTS
from hive_agents.reader_prompt.section6_existing_reader import SECTION_6_EXISTING_READER
from hive_agents.reader_prompt.section6_golden_inspired import SECTION_6_GOLDEN_INSPIRED
from hive_agents.reader_prompt.sections_shared import (
    shared_sections_after_checklist,
    shared_sections_before_checklist,
)
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta, format_trusted_manifest_block


@dataclass(frozen=True)
class AssembledReaderExperimentPrompt:
    variant: str
    prompt_version: str
    prompt_sha256: str
    stable_system_prefix: str
    trusted_manifest_block: str


def _section_6_for_variant(variant: str) -> str:
    if variant == "golden_inspired":
        return SECTION_6_GOLDEN_INSPIRED.strip()
    if variant == "existing_reader_structured":
        return SECTION_6_EXISTING_READER.strip()
    raise ValueError(f"Unsupported reader experiment variant: {variant}")


def assemble_reader_experiment_prompt(
    variant: str,
    *,
    pack: AgentPack,
    trusted_documents: list[TrustedDocumentMeta] | None = None,
) -> AssembledReaderExperimentPrompt:
    normalized = variant.strip()
    if normalized not in READER_EXPERIMENT_VARIANTS:
        raise ValueError(
            f"variant must be one of {sorted(READER_EXPERIMENT_VARIANTS)} (got {variant!r})"
        )

    pack_header = (
        f"Domain pack: domainId={pack.domainId} "
        f"domainPackId={pack.domainPackId} domainPackVersion={pack.domainPackVersion}"
    )
    shared_before = shared_sections_before_checklist()
    shared_after = shared_sections_after_checklist()
    section_6 = _section_6_for_variant(normalized)

    stable = "\n\n".join(
        [
            pack_header,
            shared_before,
            section_6,
            shared_after,
        ]
    )
    manifest_block = format_trusted_manifest_block(trusted_documents or [])
    digest = hashlib.sha256(stable.encode("utf-8")).hexdigest()
    version = f"{PROMPT_VERSION}+{normalized}"
    return AssembledReaderExperimentPrompt(
        variant=normalized,
        prompt_version=version,
        prompt_sha256=digest,
        stable_system_prefix=stable,
        trusted_manifest_block=manifest_block,
    )


def append_untrusted_manifest_to_case_user(case_user_content: str, manifest_block: str) -> str:
    if not manifest_block.strip():
        return case_user_content
    return f"{manifest_block}\n\n--- UNTRUSTED_DOCUMENT_BUNDLE ---\n{case_user_content}"
