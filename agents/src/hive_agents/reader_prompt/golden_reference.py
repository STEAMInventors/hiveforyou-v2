from __future__ import annotations

from functools import lru_cache
from pathlib import Path

READER_GOLDEN_ADAPTATION_HEADER = """\
## GOLDEN REFERENCE METHODOLOGY (Reader adaptation)

The following is the certified golden-reference study methodology (`canonical-study-v4.1`),
adapted for **candidate fact extraction only** — not for a full canonical-study-proposal/4 response.

Reader scope:
- Output a single JSON object in `extraction_json` with key `candidateFacts` (v4-shaped candidates).
- Do not emit `entities`, `conflicts`, `missingInformation`, or `voiceProposal` arrays.
- Do not perform canonical reconciliation or legal conclusions.
- Omit gaps rather than recording missing-information items as established facts.

Engine 1 domain resolution is **complete** for this study. Use the trusted Engine 1 reader context
and domain pack metadata for orientation only. **Do not reclassify the domain** or infer a different
domain from document rhetoric.

See `engine/eval/reports/reader-experiment/GOLDEN_REFERENCE_MAP.md` for preserved vs adapted vs delegated sections.
"""

_DELEGATED_SECTION_TITLES = frozenset(
    {
        "Runtime JSON contract (mandatory)",
        "Entities",
        "Conflicts",
        "Missing information",
        "Voice proposal",
        "Output",
    }
)

_DOMAIN_READER_SECTION = """\
## Domain

Engine 1 domain resolution is **complete** for this study. The trusted Engine 1 reader context and
domain pack in the system prefix define the authoritative domain, pack identity, and logical-document
inventory for this run.

Use the supplied domain pack vocabulary for naming constructs and values only. **Do not reclassify
the domain**, invent a different domain, or override Engine 1 routing from document text alone.

If a vocabulary term is marked `contextRequired`, expand it only when nearby text in the same document
supports that meaning; otherwise keep the abbreviation as written. The vocabulary helps with naming.
It is not evidence. Never create a claim because a term exists in the pack.
"""

_METHOD_READER_SECTION = """\
## Method (extraction guidance — not full proposal assembly)

1. Track important people, organizations, programs, and records while reading; use optional
   `subjectEntityId` strings on candidate facts when a stable label is evident. Do **not** emit an
   `entities[]` array in Reader output.
2. Propose **candidate facts**: optional subject + **construct** + typed **value** + **modality** +
   optional unit and time anchors, each with evidence refs.
3. Express **relationships** as facts whose value kind is `entity_ref` (name the relationship in
   `construct`); reference another subject via `subjectEntityId` or `entityId` on the value when evident.
4. Anchor **chronology** with `date` or `period` value kinds on time-relevant facts; use **modality**
   to distinguish planned, required, decided, observed, and unknown. Express whether a fact is current,
   past, or replaced with time bounds on the value, not with modality alone.
5. When sources disagree, extract separate supported facts with correct time bounds; do **not** emit
   `conflicts[]` rows (downstream Investigator / Canonical Study owns conflict records).
6. When evidence implies a gap or ambiguity, **omit** the candidate; do **not** emit
   `missingInformation[]` items (those are not validated facts).
7. Connect facts **across documents** when the evidence supports it.
"""

_DOWNSTREAM_DELEGATION_SECTION = """\
## Downstream delegation (Reader)

Do not return full `canonical-study-proposal/4` JSON. Investigator and Canonical Study agents own
`entities`, `conflicts`, `missingInformation`, and `voiceProposal`. Reader output is
`extraction_json.candidateFacts` only (see system section 9).
"""


def _split_markdown_sections(body: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []
    current_title = "__preamble__"
    current_lines: list[str] = []
    for line in body.splitlines():
        if line.startswith("## "):
            sections.append((current_title, "\n".join(current_lines).strip()))
            current_title = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)
    sections.append((current_title, "\n".join(current_lines).strip()))
    return sections


def _patch_values_section(content: str) -> str:
    patched = content.replace(
        "- `entity_ref`: `entityId` must reference an entity id you propose in `entities`.",
        "- `entity_ref`: `entityId` may reference an optional `subjectEntityId` or other stable "
        "label string when evident; do not emit a separate `entities[]` array in Reader output.",
    )
    return patched


def _patch_uncertainty_section(content: str) -> str:
    return content.replace(
        '- "The supplied evidence does not show X" belongs in `missingInformation`, not as a chipless negative claim.',
        '- "The supplied evidence does not show X" is not a candidate fact — omit it rather than asserting absence.',
    )


def adapt_golden_reference_methodology_for_reader(body: str) -> str:
    """Preserve extraction methodology; strip downstream canonical-proposal output instructions."""
    parts: list[str] = []
    for title, content in _split_markdown_sections(body):
        if title in _DELEGATED_SECTION_TITLES:
            continue
        if title == "__preamble__":
            continue
        if title == "Domain":
            parts.append(_DOMAIN_READER_SECTION.strip())
            continue
        if title == "Method (not an ontology)":
            parts.append(_METHOD_READER_SECTION.strip())
            continue
        if title == "Values":
            parts.append(_patch_values_section(content).strip())
            continue
        if title == "Uncertainty and absence":
            parts.append(_patch_uncertainty_section(content).strip())
            continue
        if content.strip():
            parts.append(f"## {title}\n\n{content.strip()}")

    parts.append(_DOWNSTREAM_DELEGATION_SECTION.strip())
    return "\n\n".join(parts)


@lru_cache(maxsize=1)
def load_golden_reference_methodology_body() -> str:
    path = Path(__file__).resolve().parent / "golden_reference_canonical_study_v4.1.md"
    return path.read_text(encoding="utf-8").strip()


def golden_reference_methodology_for_reader() -> str:
    raw = load_golden_reference_methodology_body()
    adapted = adapt_golden_reference_methodology_for_reader(raw)
    return f"{READER_GOLDEN_ADAPTATION_HEADER.strip()}\n\n{adapted}"


def shared_golden_prefix_sha256_material() -> str:
    """SHA-256 input shared by case_wide and parallel_document (stable prefix minus §5)."""
    from hive_agents.reader_prompt.sections_shared import (
        SECTION_1_ROLE,
        SECTION_2_OBJECTIVE,
        SECTION_3_TRUSTED_CONTEXT,
        SECTION_4_BOUNDARIES,
        shared_sections_after_checklist,
    )

    return "\n\n".join(
        [
            SECTION_1_ROLE.strip(),
            SECTION_2_OBJECTIVE.strip(),
            SECTION_3_TRUSTED_CONTEXT.strip(),
            SECTION_4_BOUNDARIES.strip(),
            golden_reference_methodology_for_reader(),
            shared_sections_after_checklist(architecture="case_wide"),
        ]
    )
