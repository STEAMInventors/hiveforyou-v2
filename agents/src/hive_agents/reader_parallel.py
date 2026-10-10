from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from hive_agents.reader import (
    CandidateFact,
    CandidateFactDraft,
    DocumentPage,
    ReaderExecutionLimits,
    ReaderLimitsExhausted,
    ReaderRunResult,
    ReaderVerifyContext,
    run_reader,
)
from hive_agents.reader_dedup import DedupStats, conservative_deduplicate_candidate_facts
from hive_agents.reader_prompt.constants import DEFAULT_PARALLEL_CONCURRENCY


@dataclass
class ParallelExtractionTaskResult:
    source_document_id: str
    candidate_facts: list[CandidateFact] = field(default_factory=list)
    error_code: str | None = None
    extraction_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class ReaderExperimentTiming:
    document_load_ms: int = 0
    extraction_phase_ms: int = 0
    merge_dedup_ms: int = 0
    verification_ms: int = 0
    wall_clock_ms: int = 0
    peak_concurrent_model_calls: int = 0
    model_call_count: int = 0
    rate_limit_wait_ms: int = 0
    retry_count: int = 0


def run_reader_parallel_document(
    *,
    pack: Any,
    pages: list[DocumentPage],
    lm: Any,
    verifier_client: Any,
    verify_context: ReaderVerifyContext,
    stable_system: str,
    untrusted_manifest_prefix: str | None,
    document_order: list[str],
    limits_per_document: ReaderExecutionLimits,
    merge_limits: ReaderExecutionLimits,
    concurrency: int = DEFAULT_PARALLEL_CONCURRENCY,
    truncate_verification_on_budget: bool = False,
    trace_session: Any | None = None,
) -> tuple[ReaderRunResult, ReaderExperimentTiming, DedupStats, list[ParallelExtractionTaskResult]]:
    started = time.perf_counter()
    timing = ReaderExperimentTiming()
    pages_by_doc: dict[str, list[DocumentPage]] = {}
    for page in pages:
        pages_by_doc.setdefault(page.documentId, []).append(page)

    ordered_ids = [doc_id for doc_id in document_order if doc_id in pages_by_doc]
    for doc_id in sorted(pages_by_doc.keys()):
        if doc_id not in ordered_ids:
            ordered_ids.append(doc_id)

    semaphore = asyncio.Semaphore(max(1, concurrency))
    in_flight = 0
    peak = 0
    lock = asyncio.Lock()
    task_results: list[ParallelExtractionTaskResult] = []

    async def extract_one(source_document_id: str) -> None:
        nonlocal in_flight, peak
        async with semaphore:
            async with lock:
                in_flight += 1
                peak = max(peak, in_flight)
            task_started = time.perf_counter()
            subset = pages_by_doc.get(source_document_id, [])
            try:
                partial = await asyncio.to_thread(
                    run_reader,
                    pack=pack,
                    pages=subset,
                    lm=lm,
                    verifier_client=verifier_client,
                    verify_context=verify_context,
                    limits=limits_per_document,
                    document_ids=[source_document_id],
                    stable_system=stable_system,
                    untrusted_manifest_prefix=untrusted_manifest_prefix,
                    preload_via_tools=False,
                    verify_candidates=False,
                    trace_session=None,
                )
                task_results.append(
                    ParallelExtractionTaskResult(
                        source_document_id=source_document_id,
                        candidate_facts=list(partial.candidate_facts),
                        extraction_ms=int((time.perf_counter() - task_started) * 1000),
                        input_tokens=partial.model_usage_input_tokens or 0,
                        output_tokens=partial.model_usage_output_tokens or 0,
                    )
                )
            except Exception as exc:
                task_results.append(
                    ParallelExtractionTaskResult(
                        source_document_id=source_document_id,
                        error_code=exc.__class__.__name__,
                        extraction_ms=int((time.perf_counter() - task_started) * 1000),
                    )
                )
            finally:
                async with lock:
                    in_flight -= 1

    async def _run_parallel_extractions() -> None:
        await asyncio.gather(*(extract_one(doc_id) for doc_id in ordered_ids))

    extract_started = time.perf_counter()
    asyncio.run(_run_parallel_extractions())
    timing.extraction_phase_ms = int((time.perf_counter() - extract_started) * 1000)
    timing.peak_concurrent_model_calls = peak
    timing.model_call_count = len(ordered_ids)

    merge_started = time.perf_counter()
    merged: list[CandidateFact] = []
    for doc_id in ordered_ids:
        for task in task_results:
            if task.source_document_id == doc_id and not task.error_code:
                merged.extend(task.candidate_facts)
    deduped, dedup_stats = conservative_deduplicate_candidate_facts(merged)
    timing.merge_dedup_ms = int((time.perf_counter() - merge_started) * 1000)

    verify_started = time.perf_counter()
    from hive_agents.reader import VerifierBackedReaderTools, BoundedReaderTools, _ExecutionBudget
    from hive_agents.reader_diagnostics import ReaderExecutionCounts

    execution_counts = ReaderExecutionCounts()
    verifier_backed = VerifierBackedReaderTools(
        pages,
        verifier_client,
        verify_context,
        trace=trace_session,
        execution_counts=execution_counts,
    )
    budget = _ExecutionBudget(limits=merge_limits)
    bounded_tools = BoundedReaderTools(verifier_backed, budget)
    verification_incomplete = False
    for fact in deduped:
        if not fact.evidence:
            continue
        try:
            bounded_tools.propose_fact(
                CandidateFactDraft(
                    subjectEntityId=fact.subjectEntityId,
                    construct=fact.construct,
                    value=fact.value,
                    modality=fact.modality,
                    evidence=fact.evidence,
                )
            )
        except ReaderLimitsExhausted:
            if truncate_verification_on_budget:
                verification_incomplete = True
                break
            raise
    timing.verification_ms = int((time.perf_counter() - verify_started) * 1000)
    timing.wall_clock_ms = int((time.perf_counter() - started) * 1000)

    total_in = sum(t.input_tokens for t in task_results)
    total_out = sum(t.output_tokens for t in task_results)

    result = ReaderRunResult(
        candidate_facts=deduped,
        accepted_candidate_facts=list(verifier_backed.proposed_facts),
        reasoning_steps=timing.model_call_count,
        tool_calls=execution_counts.verifier_submission_count,
        stable_system_prefix=stable_system,
        verification_incomplete=verification_incomplete,
        model_usage_input_tokens=total_in,
        model_usage_output_tokens=total_out,
        execution_counts=execution_counts,
    )
    return result, timing, dedup_stats, task_results
