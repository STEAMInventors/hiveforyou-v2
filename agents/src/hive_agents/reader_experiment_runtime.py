from __future__ import annotations

from hive_agents.pack_loader import AgentPack
from hive_agents.reader import build_reader_stable_system
from hive_agents.reader_prompt.assemble import AssembledReaderExperimentPrompt, assemble_reader_experiment_prompt
from hive_agents.reader_prompt.constants import READER_EXPERIMENT_VARIANTS
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta
from hive_agents.settings import Settings, get_settings


def trusted_documents_from_reader_request_documents(
    documents: list[object],
) -> list[TrustedDocumentMeta]:
    """Build §3 manifest entries from wire documents (ids and page counts only)."""
    metas: list[TrustedDocumentMeta] = []
    for document in documents:
        source_id = getattr(document, "source_document_id", None) or getattr(
            document, "sourceDocumentId", None
        )
        pages = getattr(document, "pages", None)
        if not isinstance(source_id, str) or not source_id.strip():
            continue
        page_count = len(pages) if isinstance(pages, list) else None
        metas.append(
            TrustedDocumentMeta(
                source_document_id=source_id.strip(),
                page_count=page_count,
            )
        )
    return metas


def resolve_reader_stable_system_for_request(
    pack: AgentPack,
    *,
    settings: Settings | None = None,
    trusted_documents: list[TrustedDocumentMeta] | None = None,
) -> tuple[str, str | None]:
    """
    Return (stable_system_prefix, untrusted_manifest_block).

    Production path when READER_EXPERIMENT_VARIANT is unset.
    """
    resolved = settings or get_settings()
    variant = resolved.reader_experiment_variant
    if not variant:
        return build_reader_stable_system(pack), None
    if variant not in READER_EXPERIMENT_VARIANTS:
        raise ValueError(f"Unsupported HIVE_READER_EXPERIMENT_VARIANT: {variant}")
    assembled: AssembledReaderExperimentPrompt = assemble_reader_experiment_prompt(
        variant,
        pack=pack,
        trusted_documents=trusted_documents,
    )
    return assembled.stable_system_prefix, assembled.trusted_manifest_block
