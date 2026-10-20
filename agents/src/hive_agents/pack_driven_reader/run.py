from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import dspy

from hive_agents.engine1_trust import Engine1ReaderContextError
from hive_agents.pack_driven_reader.adapter import (
    compile_pack_driven_reader_prompt,
    pages_to_pack_driven_payload,
)
from hive_agents.pack_driven_reader.resolve_proposal_pack import (
    PackNotAvailableError,
    ProposalPackIdentity,
    _identity_from_request,
    resolve_and_load_proposal_domain_pack,
)
from hive_agents.pack_driven_reader.document_extraction_envelope import (
    build_reader_document_extraction_envelope,
)
from hive_agents.pack_driven_reader.engine1_manifest import (
    build_case_manifest,
    parse_engine1_logical_documents,
    resolve_discover_document_type_id,
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


@dataclass(frozen=True)
class PackDrivenRunCorrelation:
    study_run_id: str
    attempt_id: str
    case_id: str
    user_id: str
    domain_id: str
    model_provider: str
    model_id: str


@dataclass
class PackDrivenDocumentResult:
    source_document_id: str
    document_type_id: str | None
    engine1_document_type_id: str | None
    classification_needs_review: bool
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
    document_extraction_envelope: dict[str, Any] | None = None


def _model_error_document_result(
    *,
    source_document_id: str,
    engine1_document_type_id: str | None,
    correlation: PackDrivenRunCorrelation,
    proposal_pack: Any,
    error_code: str,
    error_message: str,
    parse_errors: list[str],
    execution_error: str | None = None,
    raw_assistant_text: str | None = None,
    parsed_model_json: dict[str, Any] | None = None,
    prompt_version: str | None = None,
    pack_content_sha256: str | None = None,
    usage: dict[str, int | None] | None = None,
    latency_ms: int | None = None,
) -> PackDrivenDocumentResult:
    envelope = build_reader_document_extraction_envelope(
        study_run_id=correlation.study_run_id,
        attempt_id=correlation.attempt_id,
        case_id=correlation.case_id,
        user_id=correlation.user_id,
        source_document_id=source_document_id,
        domain_id=correlation.domain_id,
        pack=proposal_pack,
        pack_content_sha256=pack_content_sha256,
        prompt_version=prompt_version,
        model_provider=correlation.model_provider,
        model_id=correlation.model_id,
        status="MODEL_ERROR",
        raw_assistant_text=raw_assistant_text,
        parsed_model_json=parsed_model_json,
        usage=usage,
        latency_ms=latency_ms,
        error_code=error_code,
        error_message=error_message,
    )
    return PackDrivenDocumentResult(
        source_document_id=source_document_id,
        document_type_id=None,
        engine1_document_type_id=engine1_document_type_id,
        classification_needs_review=False,
        parse_ok=False,
        parse_errors=parse_errors,
        execution_error=execution_error,
        prompt_version=prompt_version,
        pack_content_sha256=pack_content_sha256,
        usage=usage or {},
        model_call_ms=latency_ms or 0,
        document_extraction_envelope=envelope,
    )


def _post_extraction_processing_failure_result(
    *,
    source_document_id: str,
    engine1_document_type_id: str | None,
    captured_envelope: dict[str, Any],
    exc: Exception,
    call_ms: int,
    usage: dict[str, int | None],
    prompt_version: str | None,
    pack_content_sha256: str | None,
) -> PackDrivenDocumentResult:
    return PackDrivenDocumentResult(
        source_document_id=source_document_id,
        document_type_id=None,
        engine1_document_type_id=engine1_document_type_id,
        classification_needs_review=False,
        parse_ok=False,
        parse_errors=[f"post_extraction_processing_failed:{exc.__class__.__name__}"],
        execution_error=exc.__class__.__name__,
        model_call_ms=call_ms,
        usage=usage,
        prompt_version=prompt_version,
        pack_content_sha256=pack_content_sha256,
        document_extraction_envelope=captured_envelope,
    )


def _pages_for_document(pages: list[DocumentPage], source_document_id: str) -> list[DocumentPage]:
    return [page for page in pages if page.documentId == source_document_id]


def _discover_document_type_id_for_logical_doc(
    *,
    pack: Any,
    logical_doc: Any,
) -> str | None:
    resolved = resolve_discover_document_type_id(pack, logical_doc.discover_document_type_label)
    if resolved is not None:
        return resolved
    return resolve_discover_document_type_id(pack, logical_doc.document_type_id)


def _classification_needs_review(
    *,
    parsed: Any,
    engine1_document_type_id: str | None,
) -> bool:
    if parsed.needs_review:
        return True
    reader_type = parsed.document_type_id
    if (
        isinstance(engine1_document_type_id, str)
        and engine1_document_type_id.strip()
        and isinstance(reader_type, str)
        and reader_type.strip()
        and engine1_document_type_id.strip() != reader_type.strip()
    ):
        return True
    return False


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
    engine1_document_type_id: str | None,
    correlation: PackDrivenRunCorrelation,
    lm: dspy.LM,
    verifier_client: ReaderVerifierClient,
    verify_context: ReaderVerifyContext,
) -> PackDrivenDocumentResult:
    if not doc_pages:
        return _model_error_document_result(
            source_document_id=source_document_id,
            engine1_document_type_id=engine1_document_type_id,
            correlation=correlation,
            proposal_pack=proposal_pack,
            error_code="MISSING_PAGES",
            error_message="No trusted pages were supplied for this logical document.",
            parse_errors=["missing_pages_for_logical_document"],
        )

    compiled: Any = None
    try:
        compiled = compile_pack_driven_reader_prompt(
            pack=proposal_pack,
            case_manifest=case_manifest,
            source_document_id=source_document_id,
            pages=pages_to_pack_driven_payload(doc_pages),
        )
        call_started = time.perf_counter()
        try:
            extraction = call_pack_driven_extraction(lm=lm, compiled=compiled)
        except Exception as exc:
            call_ms = int((time.perf_counter() - call_started) * 1000)
            return _model_error_document_result(
                source_document_id=source_document_id,
                engine1_document_type_id=engine1_document_type_id,
                correlation=correlation,
                proposal_pack=proposal_pack,
                error_code=exc.__class__.__name__,
                error_message="Model call failed for document extraction.",
                parse_errors=[f"document_extraction_failed:{exc.__class__.__name__}"],
                execution_error=exc.__class__.__name__,
                prompt_version=compiled.prompt_version,
                pack_content_sha256=compiled.pack_content_sha256,
                latency_ms=call_ms,
            )
        call_ms = int((time.perf_counter() - call_started) * 1000)
        assistant_text = extraction.assistant_text
        parsed_model_json = extraction.parsed_model_json
        usage = extraction.usage

        if not assistant_text.strip():
            return _model_error_document_result(
                source_document_id=source_document_id,
                engine1_document_type_id=engine1_document_type_id,
                correlation=correlation,
                proposal_pack=proposal_pack,
                error_code="EMPTY_MODEL_RESPONSE",
                error_message="Model returned no assistant text.",
                parse_errors=["empty_model_response"],
                prompt_version=compiled.prompt_version,
                pack_content_sha256=compiled.pack_content_sha256,
                usage=usage,
                latency_ms=call_ms,
            )

        if parsed_model_json is None:
            envelope = build_reader_document_extraction_envelope(
                study_run_id=correlation.study_run_id,
                attempt_id=correlation.attempt_id,
                case_id=correlation.case_id,
                user_id=correlation.user_id,
                source_document_id=source_document_id,
                domain_id=correlation.domain_id,
                pack=proposal_pack,
                pack_content_sha256=compiled.pack_content_sha256,
                prompt_version=compiled.prompt_version,
                model_provider=correlation.model_provider,
                model_id=correlation.model_id,
                status="INVALID_JSON",
                raw_assistant_text=assistant_text,
                parsed_model_json=None,
                usage=usage,
                latency_ms=call_ms,
                error_code="INVALID_JSON",
                error_message="Assistant response was not a JSON object.",
            )
            return PackDrivenDocumentResult(
                source_document_id=source_document_id,
                document_type_id=None,
                engine1_document_type_id=engine1_document_type_id,
                classification_needs_review=False,
                parse_ok=False,
                parse_errors=["invalid_json_response"],
                model_call_ms=call_ms,
                usage=usage,
                prompt_version=compiled.prompt_version,
                pack_content_sha256=compiled.pack_content_sha256,
                document_extraction_envelope=envelope,
            )

        captured_envelope = build_reader_document_extraction_envelope(
            study_run_id=correlation.study_run_id,
            attempt_id=correlation.attempt_id,
            case_id=correlation.case_id,
            user_id=correlation.user_id,
            source_document_id=source_document_id,
            domain_id=correlation.domain_id,
            pack=proposal_pack,
            pack_content_sha256=compiled.pack_content_sha256,
            prompt_version=compiled.prompt_version,
            model_provider=correlation.model_provider,
            model_id=correlation.model_id,
            status="SUCCEEDED",
            raw_assistant_text=assistant_text,
            parsed_model_json=parsed_model_json,
            usage=usage,
            latency_ms=call_ms,
        )

        try:
            from hive_agents.pack_driven_reader.compiler_bridge import parse_pack_driven_extraction_via_node

            parsed = parse_pack_driven_extraction_via_node(
                pack=proposal_pack,
                raw=parsed_model_json,
                expected_source_document_id=source_document_id,
            )
            candidates: list[CandidateFact] = []
            if parsed.ok and not parsed.needs_review:
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
                document_type_id=parsed.document_type_id,
                engine1_document_type_id=engine1_document_type_id,
                classification_needs_review=_classification_needs_review(
                    parsed=parsed,
                    engine1_document_type_id=engine1_document_type_id,
                ),
                parse_ok=parsed.ok,
                parse_errors=list(parsed.errors),
                candidate_facts=candidates,
                accepted_candidate_facts=accepted,
                verifier_rejected_count=rejected,
                model_call_ms=call_ms,
                usage=usage,
                prompt_version=compiled.prompt_version,
                pack_content_sha256=compiled.pack_content_sha256,
                document_extraction_envelope=captured_envelope,
            )
        except Exception as exc:
            return _post_extraction_processing_failure_result(
                source_document_id=source_document_id,
                engine1_document_type_id=engine1_document_type_id,
                captured_envelope=captured_envelope,
                exc=exc,
                call_ms=call_ms,
                usage=usage,
                prompt_version=compiled.prompt_version,
                pack_content_sha256=compiled.pack_content_sha256,
            )
    except Exception as exc:
        prompt_version = compiled.prompt_version if compiled is not None else None
        pack_hash = compiled.pack_content_sha256 if compiled is not None else None
        return _model_error_document_result(
            source_document_id=source_document_id,
            engine1_document_type_id=engine1_document_type_id,
            correlation=correlation,
            proposal_pack=proposal_pack,
            error_code=exc.__class__.__name__,
            error_message="Document extraction pipeline failed.",
            parse_errors=[f"document_extraction_failed:{exc.__class__.__name__}"],
            execution_error=exc.__class__.__name__,
            prompt_version=prompt_version,
            pack_content_sha256=pack_hash,
        )


def _fan_in_document_results(
    document_order: list[str],
    results_by_id: dict[str, PackDrivenDocumentResult],
    *,
    correlation: PackDrivenRunCorrelation,
    proposal_pack: Any,
    engine1_type_by_id: dict[str, str | None],
) -> list[PackDrivenDocumentResult]:
    per_document: list[PackDrivenDocumentResult] = []
    for source_document_id in document_order:
        existing = results_by_id.get(source_document_id)
        if existing is not None:
            per_document.append(existing)
            continue
        per_document.append(
            _model_error_document_result(
                source_document_id=source_document_id,
                engine1_document_type_id=engine1_type_by_id.get(source_document_id),
                correlation=correlation,
                proposal_pack=proposal_pack,
                error_code="DOCUMENT_TASK_MISSING_FROM_FAN_IN",
                error_message="Document task did not complete in parallel fan-in.",
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
    correlation: PackDrivenRunCorrelation,
    proposal_pack_identity: ProposalPackIdentity | None = None,
) -> tuple[ReaderRunResult, list[PackDrivenDocumentResult], dict[str, Any], list[dict[str, Any]]]:
    if not engine1_reader_context_json.strip():
        raise Engine1ReaderContextError(
            "PACK_DRIVEN_ENGINE1_CONTEXT_REQUIRED",
            "Pack-driven Reader requires engine1ReaderContextJson from the worker.",
        )

    try:
        resolved_pack = resolve_and_load_proposal_domain_pack(
            domain_id=correlation.domain_id,
            settings=settings,
            requested_identity=proposal_pack_identity,
        )
    except PackNotAvailableError as exc:
        raise Engine1ReaderContextError(
            "PACK_DRIVEN_PROPOSAL_PACK_NOT_AVAILABLE",
            str(exc),
        ) from exc
    pack_path = resolved_pack.path
    proposal_pack = resolved_pack.pack
    logical_docs, document_order = parse_engine1_logical_documents(engine1_reader_context_json)
    case_manifest = build_case_manifest(logical_docs, pack=proposal_pack)
    engine1_type_by_id = {
        doc.source_document_id: _discover_document_type_id_for_logical_doc(
            pack=proposal_pack,
            logical_doc=doc,
        )
        for doc in logical_docs
    }

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
                    engine1_document_type_id=engine1_type_by_id.get(source_document_id),
                    correlation=correlation,
                    lm=lm,
                    verifier_client=verifier_client,
                    verify_context=verify_context,
                )
            except Exception as exc:
                result = _model_error_document_result(
                    source_document_id=source_document_id,
                    engine1_document_type_id=engine1_type_by_id.get(source_document_id),
                    correlation=correlation,
                    proposal_pack=proposal_pack,
                    error_code=exc.__class__.__name__,
                    error_message="Document extraction task failed.",
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

    per_document = _fan_in_document_results(
        document_order,
        results_by_id,
        correlation=correlation,
        proposal_pack=proposal_pack,
        engine1_type_by_id=engine1_type_by_id,
    )
    document_extractions = [
        row.document_extraction_envelope
        for row in per_document
        if row.document_extraction_envelope is not None
    ]
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
                "engine1DocumentTypeId": row.engine1_document_type_id,
                "classificationNeedsReview": row.classification_needs_review,
                "parseOk": row.parse_ok,
                "parseErrorCount": len(row.parse_errors),
                "executionError": row.execution_error,
                "extractionStatus": (
                    row.document_extraction_envelope.get("status")
                    if row.document_extraction_envelope is not None
                    else None
                ),
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
    return result, per_document, experiment_audit, document_extractions


def document_extractions_to_wire(rows: list[PackDrivenDocumentResult]) -> list[dict[str, Any]]:
    wire: list[dict[str, Any]] = []
    for row in rows:
        if row.document_extraction_envelope is not None:
            wire.append(row.document_extraction_envelope)
    return wire


def per_document_results_to_wire(rows: list[PackDrivenDocumentResult]) -> list[dict[str, Any]]:
    wire: list[dict[str, Any]] = []
    for row in rows:
        wire.append(
            {
                "sourceDocumentId": row.source_document_id,
                "documentTypeId": row.document_type_id,
                "engine1DocumentTypeId": row.engine1_document_type_id,
                "classificationNeedsReview": row.classification_needs_review,
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
