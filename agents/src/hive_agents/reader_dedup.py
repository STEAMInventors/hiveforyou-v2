from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from hive_agents.reader import CandidateFact


@dataclass(frozen=True)
class DedupStats:
    pre_merge_count: int
    post_merge_count: int
    removed_count: int


def _value_signature(value: dict[str, Any]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _construct_signature(construct: dict[str, Any]) -> tuple[str, str | None, str | None]:
    return (
        str(construct.get("measure") or "").strip(),
        construct.get("task") if construct.get("task") else None,
        construct.get("administration") if construct.get("administration") else None,
    )


def _primary_evidence_key(fact: CandidateFact) -> tuple[str, int, str] | None:
    if not fact.evidence:
        return None
    ev = fact.evidence[0]
    return (str(ev.sourceDocumentId), int(ev.page), str(ev.quote).strip())


def _facts_semantically_duplicate(a: CandidateFact, b: CandidateFact) -> bool:
    construct_a = a.construct.model_dump() if hasattr(a.construct, "model_dump") else dict(a.construct)
    construct_b = b.construct.model_dump() if hasattr(b.construct, "model_dump") else dict(b.construct)
    if _construct_signature(construct_a) != _construct_signature(construct_b):
        return False
    if a.modality != b.modality:
        return False
    value_a = a.value.model_dump() if hasattr(a.value, "model_dump") else dict(a.value)
    value_b = b.value.model_dump() if hasattr(b.value, "model_dump") else dict(b.value)
    if _value_signature(value_a) != _value_signature(value_b):
        return False
    key_a = _primary_evidence_key(a)
    key_b = _primary_evidence_key(b)
    if key_a is None or key_b is None:
        return False
    if key_a == key_b:
        return True
    if key_a[0] == key_b[0] and key_a[1] == key_b[1] and key_a[2] != key_b[2]:
        return False
    return False


def conservative_deduplicate_candidate_facts(
    facts: list[CandidateFact],
) -> tuple[list[CandidateFact], DedupStats]:
    """Drop only exact semantic duplicates with identical primary evidence."""
    pre = len(facts)
    kept: list[CandidateFact] = []
    for fact in facts:
        if any(_facts_semantically_duplicate(fact, existing) for existing in kept):
            continue
        kept.append(fact)
    post = len(kept)
    return kept, DedupStats(pre_merge_count=pre, post_merge_count=post, removed_count=pre - post)