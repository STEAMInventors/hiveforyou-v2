from hive_agents.reader import CandidateFact, ClaimValue, ConstructParts, SourceEvidence
from hive_agents.reader_dedup import conservative_deduplicate_candidate_facts


def _fact(
    measure: str,
    text: str,
    *,
    doc: str = "doc-a",
    page: int = 1,
    quote: str = "alpha",
) -> CandidateFact:
    return CandidateFact(
        id=f"fact-{measure}-{quote}",
        construct=ConstructParts(measure=measure, task=None, administration=None),
        value=ClaimValue(kind="text", textValue=text),
        modality="observed",
        evidence=[
            SourceEvidence(sourceDocumentId=doc, page=page, quote=quote),
        ],
    )


def test_conservative_dedup_only_exact_duplicates() -> None:
    a = _fact("student_grade", "2", quote="Grade 2")
    b = _fact("student_grade", "2", quote="Grade 2")
    c = _fact("student_grade", "3", quote="Grade 3")
    deduped, stats = conservative_deduplicate_candidate_facts([a, b, c])
    assert stats.pre_merge_count == 3
    assert stats.post_merge_count == 2
    assert stats.removed_count == 1


def test_different_quotes_same_page_not_merged() -> None:
    a = _fact("reading_rate", "42", quote="42 wcpm")
    b = _fact("reading_rate", "42", quote="forty-two wcpm")
    deduped, stats = conservative_deduplicate_candidate_facts([a, b])
    assert stats.removed_count == 0
    assert len(deduped) == 2