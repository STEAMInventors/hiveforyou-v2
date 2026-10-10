from __future__ import annotations

from hive_agents.pack_loader import AgentPack
from hive_agents.reader import build_reader_stable_system
from hive_agents.reader_prompt.assemble import AssembledReaderExperimentPrompt, assemble_reader_architecture_prompt
from hive_agents.reader_prompt.constants import READER_ARCHITECTURE_VARIANTS
from hive_agents.reader_prompt.trusted_manifest import TrustedDocumentMeta
from hive_agents.settings import Settings, get_settings


def trusted_documents_from_reader_request_documents(
    documents: list[object],
) -> list[TrustedDocumentMeta]:
    """Build manifest entries from wire documents (ids and page counts only)."""
    metas: list[TrustedDocumentMeta] = []
    for document in documents:
        source_id = getattr(document, "source_document_id", None) or getattr(
            document, "sourceDocumentId", None
        )
        pages = getattr(document, "pages", None)
        filename = getattr(document, "filename", None) or getattr(document, "originalFilename", None)
        if not isinstance(source_id, str) or not source_id.strip():
            continue
        page_count = len(pages) if isinstance(pages, list) else None
        metas.append(
            TrustedDocumentMeta(
                source_document_id=source_id.strip(),
                filename=filename if isinstance(filename, str) else None,
                page_count=page_count,
            )
        )
    return metas


def resolve_reader_architecture(settings: Settings | None = None) -> str | None:
    resolved = settings or get_settings()
    raw = resolved.reader_architecture_variant
    if not raw:
        legacy = resolved.reader_experiment_variant
        if legacy:
            raise ValueError(
                "HIVE_READER_EXPERIMENT_VARIANT is retired; use HIVE_READER_ARCHITECTURE_VARIANT="
                "case_wide|parallel_document"
            )
        return None
    if raw not in READER_ARCHITECTURE_VARIANTS:
        raise ValueError(f"Unsupported HIVE_READER_ARCHITECTURE_VARIANT: {raw}")
    return raw


def resolve_reader_stable_system_for_request(
    pack: AgentPack,
    *,
    settings: Settings | None = None,
    trusted_documents: list[TrustedDocumentMeta] | None = None,
    engine1_context_json: str | None = None,
) -> tuple[str, str | None]:
    """
    Return (stable_system_prefix, untrusted_manifest_block).

    Production path when HIVE_READER_ARCHITECTURE_VARIANT is unset.
    """
    architecture = resolve_reader_architecture(settings)
    if not architecture:
        return build_reader_stable_system(pack), None
    from hive_agents.reader_prompt.trusted_manifest import format_engine1_context_block

    assembled: AssembledReaderExperimentPrompt = assemble_reader_architecture_prompt(
        architecture,
        pack=pack,
        trusted_documents=trusted_documents,
        engine1_context_block=format_engine1_context_block(engine1_context_json or ""),
    )
    return assembled.stable_system_prefix, assembled.trusted_manifest_block
