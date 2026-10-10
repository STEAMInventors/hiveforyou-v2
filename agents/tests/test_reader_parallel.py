from __future__ import annotations

import threading
import time
from unittest.mock import MagicMock

import pytest

from hive_agents.reader import (
    CandidateFact,
    ClaimValue,
    ConstructParts,
    DocumentPage,
    PageWord,
    ReaderRunResult,
    ReaderVerifyContext,
    SourceEvidence,
)
from hive_agents.reader_parallel import run_reader_parallel_document
from hive_agents.reader_prompt.constants import READER_EXPERIMENT_PARALLEL_PER_DOC_LIMITS
from hive_agents.verifier_client import ReaderVerifierResult


@pytest.fixture
def sample_pages() -> list[DocumentPage]:
    pages: list[DocumentPage] = []
    for doc_id in ("doc-1", "doc-2", "doc-3"):
        for page_number in (1, 2):
            pages.append(
                DocumentPage(
                    documentId=doc_id,
                    pageNumber=page_number,
                    words=[PageWord(seq=0, text=f"{doc_id}-p{page_number}")],
                )
            )
    return pages


def test_run_reader_parallel_document_bounded_concurrency(sample_pages: list[DocumentPage]) -> None:
    concurrency = 2
    active = 0
    peak = 0
    lock = threading.Lock()
    lm = object()
    seen_lm_ids: list[int] = []
    verifier_client = MagicMock()
    verifier_client.verify_fact.return_value = ReaderVerifierResult(
        accepted=True,
        reasons=[],
        verified_evidence=[{"sourceDocumentId": "doc-1", "page": 1, "quote": "x"}],
    )

    def fake_run_reader(**kwargs: object) -> ReaderRunResult:
        nonlocal active, peak
        assert kwargs.get("lm") is lm
        seen_lm_ids.append(id(kwargs["lm"]))
        with lock:
            active += 1
            peak = max(peak, active)
        try:
            time.sleep(0.05)
            doc_ids = kwargs.get("document_ids")
            assert isinstance(doc_ids, list) and len(doc_ids) == 1
            doc_id = doc_ids[0]
            quote = f"{doc_id}-p1"
            return ReaderRunResult(
                candidate_facts=[
                    CandidateFact(
                        id=f"fact-{doc_id}",
                        subjectEntityId=None,
                        construct=ConstructParts(measure="demo_fact", task=None, administration=None),
                        value=ClaimValue(kind="text", textValue=doc_id),
                        modality="observed",
                        evidence=[
                            SourceEvidence(
                                sourceDocumentId=doc_id,
                                page=1,
                                quote=quote,
                            )
                        ],
                    )
                ],
                accepted_candidate_facts=[],
                reasoning_steps=1,
                tool_calls=0,
                stable_system_prefix="sys",
            )
        finally:
            with lock:
                active -= 1

    import hive_agents.reader_parallel as reader_parallel_module

    original = reader_parallel_module.run_reader
    reader_parallel_module.run_reader = fake_run_reader  # type: ignore[assignment]
    try:
        result, timing, _dedup, task_results = run_reader_parallel_document(
            pack=MagicMock(),
            pages=sample_pages,
            lm=lm,
            verifier_client=verifier_client,
            verify_context=ReaderVerifyContext(case_id="case", user_id="user"),
            stable_system="sys",
            untrusted_manifest_prefix=None,
            document_order=["doc-1", "doc-2", "doc-3"],
            limits_per_document=READER_EXPERIMENT_PARALLEL_PER_DOC_LIMITS,
            merge_limits=READER_EXPERIMENT_PARALLEL_PER_DOC_LIMITS,
            concurrency=concurrency,
        )
    finally:
        reader_parallel_module.run_reader = original

    assert len(task_results) == 3
    assert all(task.error_code is None for task in task_results)
    assert timing.peak_concurrent_model_calls <= concurrency
    assert timing.peak_concurrent_model_calls >= concurrency
    assert peak <= concurrency
    assert len(result.candidate_facts) == 3
    assert len(set(seen_lm_ids)) == 1
