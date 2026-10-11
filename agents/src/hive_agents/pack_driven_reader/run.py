from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import dspy

from hive_agents.engine1_trust import Engine1ReaderContextError
from hive_agents.pack_driven_reader.adapter import (
    compile_pack_driven_reader_prompt,
    default_iep_v03_proposed_pack_path,
    load_proposal_domain_pack,
    pages_to_pack_driven_payload,
)
from hive_agents.pack_driven_reader.engine1_manifest import (
    build_case_manifest,
    parse_engine1_logical_documents,
)
from hive_agents.pack_driven_reader.lm_extract import call_pack_driven_extraction
from hive_agents.pack_driven_reader.map_to_candidate import pack_extraction_to_candidate_facts
from hive_agents.reader import (
    CandidateFact,
    CandidateFactDraft,
    DocumentPage,
    ReaderRunResult,
    ReaderVerifyContext,
    VerifierBackedReaderTools,
)
from hive_agents.reader_diagnostics import ReaderExecutionCounts, fact_has_usable_evidence
from hive_agents.verifier_client import ReaderVerifierClient


@dataclass
class PackDrivenDocumentResult:
    source_document_id: str
    document_type_id: str | None
    parse_ok: bool
    parse_errors: list[str]
    candidate_facts: list[CandidateFact] = field(default_factory=list)
    accepted_candidate_facts: list[CandidateFact] = field(default_factory=list)
    verifier_rejected_count: int = 0
    model_call_ms: int = 0
    usage: dict[str, int | None] = field(default_factory=dict)
    execution_error: str | None = None
    prompt_version: str | None = None
    pack_content_sha256: str | None = None


def resolve_proposal_pack_path(settings: Any) -> Path:
    override = getattr(settings, "pack_driven_reader_proposal_json", None)
    if override is not None:
        return Path(override).expanduser().resolve()
    return default_iep_v03_proposed_pack_path()


def _pages_for_document(pages: list[DocumentPage], source_document_id: str) -> list[DocumentPage]:
    return [page for page in pages if page.documentId == source_document_id]


def _accumulate_usage(
    totals: dict[str, int],
    usage: dict[str, int | None],
) -> None:
    for key in (
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_write_input_tokens",
    ):
        value = usage.get(key)
        if isinstance(value, int):
            totals[key] = totals.get(key, 0) + value


def _process_single_document(
    *,
    source_document_id: str,
    doc_pages: list[DocumentPage],
    proposal_pack: Any,
    case_manifest: Any,
    document_type_id: str | None,
    lm: dspy.LM,
    verifier_client: ReaderVerifierClient,
    verify_context: ReaderVerifyContext,
) -> PackDrivenDocumentResult:
    if not doc_pages:
        return PackDrivenDocumentResult(
            source_document_id=source_document_id,
            document_type_id=document_type_id,
            parse_ok=False,
            parse_errors=["missing_pages_for_logical_document"],
        )

    try:
        compiled = compile_pack_driven_reader_prompt(
            pack=proposal_pack,
            document_type_id=document_type_id,
            case_manifest=case_manifest,
            source_document_id=source_document_id,
            pages=pages_to_pack_driven_payload(doc_pages),
        )
        call_started = time.perf_counter()
        raw, usage = call_pack_driven_extraction(lm=lm, compiled=compiled)
        call_ms = int((time.perf_counter() - call_started) * 1000)

        from hive_agents.pack_driven_reader.compiler_bridge import parse_pack_driven_extraction_via_node

        parsed = parse_pack_driven_extraction_via_node(
            pack=proposal_pack,
            raw=raw,
            expected_source_document_id=source_document_id,
            selected_record_type_ids=compiled.selected_record_type_ids,
        )
        candidates: list[CandidateFact] = []
        if parsed.ok:
            candidates = pack_extraction_to_candidate_facts(
                source_document_id=source_document_id,
                record_instances=parsed.record_instances,
            )

        tools = VerifierBackedReaderTools(
            doc_pages,
            verifier_client,
            verify_context,
        )
        for candidate in candidates:
            if not candidate.evidence:
                continue
            tools.propose_fact(
                CandidateFactDraft(
                    subjectEntityId=candidate.subjectEntityId,
                    construct=candidate.construct,
                    value=candidate.value,
                    modality=candidate.modality,
                    evidence=candidate.evidence,
                )
            )
        accepted = list(tools.proposed_facts)
        rejected = len(candidates) - len(accepted)

        return PackDrivenDocumentResult(
            source_document_id=source_document_id,
            document_type_id=document_type_id,
            parse_ok=parsed.ok,
            parse_errors=list(parsed.errors),
            candidate_facts=candidates,
            accepted_candidate_facts=accepted,
            verifier_rejected_count=rejected,
            model_call_ms=call_ms,
            usage=usage,
            prompt_version=compiled.prompt_version,
            pack_content_sha256=compiled.pack_content_sha256,
        )
    except Exception as exc:
        return PackDrivenDocumentResult(
            source_document_id=source_document_id,
            document_type_id=document_type_id,
            parse_ok=False,
            parse_errors=[f"document_extraction_failed:{exc.__class__.__name__}"],
            execution_error=exc.__class__.__name__,
        )


def _fan_in_document_results(
    document_order: list[str],
    results_by_id: dict[str, PackDrivenDocumentResult],
) -> list[PackDrivenDocumentResult]:
    per_document: list[PackDrivenDocumentResult] = []
    for source_document_id in document_order:
        existing = results_by_id.get(source_document_id)
        if existing is not None:
            per_document.append(existing)
            continue
        per_document.append(
            PackDrivenDocumentResult(
                source_document_id=source_document_id,
                document_type_id=None,
                parse_ok=False,
                parse_errors=["document_task_missing_from_fan_in"],
            )
        )
    return per_document


def run_pack_driven_reader(
    *,
    pages: list[DocumentPage],
    lm: dspy.LM,
    verifier_client: ReaderVerifierClient,
    verify_context: ReaderVerifyContext,
    engine1_reader_context_json: str,
    settings: Any,
) -> tuple[ReaderRunResult, list[PackDrivenDocumentResult], dict[str, Any]]:
    if not engine1_reader_context_json.strip():
        raise Engine1ReaderContextError(
            "PACK_DRIVEN_ENGINE1_CONTEXT_REQUIRED",
            "Pack-driven Reader requires engine1ReaderContextJson from the worker.",
        )

    pack_path = resolve_proposal_pack_path(settings)
    proposal_pack = load_proposal_domain_pack(pack_path)
    logical_docs, document_order = parse_engine1_logical_documents(engine1_reader_context_json)
    case_manifest = build_case_manifest(logical_docs)
    doc_type_by_id = {doc.source_document_id: doc.document_type_id for doc in logical_docs}

    concurrency = max(1, int(getattr(settings, "reader_parallel_concurrency", 8) or 8))
    wall_started = time.perf_counter()
    usage_totals: dict[str, int] = {}
    peak_concurrent = 0
    in_flight = 0
    lock = asyncio.Lock()
    results_by_id: dict[str, PackDrivenDocumentResult] = {}
    semaphore = asyncio.Semaphore(concurrency)

    async def extract_one(source_document_id: str) -> None:
        nonlocal peak_concurrent, in_flight
        doc_pages = _pages_for_document(pages, source_document_id)
        async with semaphore:
            async with lock:
                in_flight += 1
                peak_concurrent = max(peak_concurrent, in_flight)
            try:
                result = await asyncio.to_thread(
                    _process_single_document,
                    source_document_id=source_document_id,
                    doc_pages=doc_pages,
                    proposal_pack=proposal_pack,
                    case_manifest=case_manifest,
                    document_type_id=doc_type_by_id.get(source_document_id),
                    lm=lm,
                    verifier_client=verifier_client,
                    verify_context=verify_context,
                )
            except Exception as exc:
                result = PackDrivenDocumentResult(
                    source_document_id=source_document_id,
                    document_type_id=doc_type_by_id.get(source_document_id),
                    parse_ok=False,
                    parse_errors=[f"document_task_failed:{exc.__class__.__name__}"],
                    execution_error=exc.__class__.__name__,
                )
            finally:
                async with lock:
                    in_flight -= 1
        results_by_id[source_document_id] = result

    async def _run_all() -> None:
        await asyncio.gather(*(extract_one(doc_id) for doc_id in document_order))

    asyncio.run(_run_all())

    per_document = _fan_in_document_results(document_order, results_by_id)
    all_candidates: list[CandidateFact] = []
    all_accepted: list[CandidateFact] = []
    prompt_version: str | None = None
    pack_content_sha256: str | None = None

    for row in per_document:
        _accumulate_usage(usage_totals, row.usage)
        all_candidates.extend(row.candidate_facts)
        all_accepted.extend(row.accepted_candidate_facts)
        if prompt_version is None and row.prompt_version:
            prompt_version = row.prompt_version
            pack_content_sha256 = row.pack_content_sha256

    model_call_count = sum(1 for row in per_document if row.model_call_ms > 0)
    wall_ms = int((time.perf_counter() - wall_started) * 1000)
    execution_counts = ReaderExecutionCounts(
        candidate_fact_count=len(all_candidates),
        candidates_with_evidence_count=sum(1 for fact in all_candidates if fact_has_usable_evidence(fact)),
        verifier_submission_count=len(all_candidates),
        accepted_fact_count=len(all_accepted),
        rejected_fact_count=len(all_candidates) - len(all_accepted),
        verifier_error_count=0,
    )

    experiment_audit: dict[str, Any] = {
        "readerMode": "pack_driven",
        "readerArchitectureVariant": None,
        "wallClockMs": wall_ms,
        "modelCallCount": model_call_count,
        "parallelConcurrency": concurrency,
        "peakConcurrentModelCalls": peak_concurrent,
        "packProposalPath": str(pack_path),
        "promptVersion": prompt_version,
        "packContentSha256": pack_content_sha256,
        "inputTokens": usage_totals.get("input_tokens", 0),
        "outputTokens": usage_totals.get("output_tokens", 0),
        "cacheReadInputTokens": usage_totals.get("cache_read_input_tokens", 0),
        "cacheWriteInputTokens": usage_totals.get("cache_write_input_tokens", 0),
        "perDocument": [
            {
                "sourceDocumentId": row.source_document_id,
                "documentTypeId": row.document_type_id,
                "parseOk": row.parse_ok,
                "parseErrorCount": len(row.parse_errors),
                "executionError": row.execution_error,
                "candidateFactCount": len(row.candidate_facts),
                "acceptedFactCount": len(row.accepted_candidate_facts),
                "verifierRejectedCount": row.verifier_rejected_count,
                "modelCallMs": row.model_call_ms,
                "inputTokens": row.usage.get("input_tokens"),
                "outputTokens": row.usage.get("output_tokens"),
                "cacheReadInputTokens": row.usage.get("cache_read_input_tokens"),
                "cacheWriteInputTokens": row.usage.get("cache_write_input_tokens"),
            }
            for row in per_document
        ],
    }
    result = ReaderRunResult(
        candidate_facts=all_candidates,
        accepted_candidate_facts=all_accepted,
        reasoning_steps=0,
        tool_calls=len(all_candidates),
        stable_system_prefix="pack-driven-reader",
        model_usage_input_tokens=usage_totals.get("input_tokens") or None,
        model_usage_output_tokens=usage_totals.get("output_tokens") or None,
        model_usage_cache_read_input_tokens=usage_totals.get("cache_read_input_tokens") or None,
        model_usage_cache_write_input_tokens=usage_totals.get("cache_write_input_tokens") or None,
        execution_counts=execution_counts,
    )
    return result, per_document, experiment_audit


def per_document_results_to_wire(rows: list[PackDrivenDocumentResult]) -> list[dict[str, Any]]:
    wire: list[dict[str, Any]] = []
    for row in rows:
        wire.append(
            {
                "sourceDocumentId": row.source_document_id,
                "documentTypeId": row.document_type_id,
                "parseOk": row.parse_ok,
                "parseErrors": row.parse_errors,
                "executionError": row.execution_error,
                "candidateFacts": [
                    fact.model_dump(mode="json", by_alias=False) for fact in row.candidate_facts
                ],
                "acceptedCandidateFacts": [
                    fact.model_dump(mode="json", by_alias=False) for fact in row.accepted_candidate_facts
                ],
            }
        )
    return wire
