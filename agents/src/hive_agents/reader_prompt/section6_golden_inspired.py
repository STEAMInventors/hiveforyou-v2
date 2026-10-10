from __future__ import annotations

from hive_agents.pack_loader import AgentPack, ReaderCoverageExport


def _format_reader_coverage_lists(coverage: ReaderCoverageExport) -> tuple[str, str, str, str, int]:
    document_types = "\n".join(f"- {dt}" for dt in coverage.documentTypes)
    if not document_types.strip():
        document_types = "- (none listed in study-agents export; infer type from structure map and page content)"
    focus = (
        "\n".join(f"- `{key}`" for key in coverage.focusConstructs)
        or "- (none listed in pack export)"
    )
    family_roles = "\n".join(f"- {role}" for role in coverage.familyRoles)
    if not family_roles.strip():
        family_roles = "- (none listed; use structure map family roles when provided in trusted context)"
    relationships = "\n".join(f"- `{kind}`" for kind in coverage.relationshipKinds)
    if not relationships.strip():
        relationships = "- (none listed; use structure map relationship kinds when provided)"
    vocab_count = len(coverage.vocabulary)
    return document_types, focus, family_roles, relationships, vocab_count


def build_case_wide_domain_coverage_checklist(pack: AgentPack) -> str:
    """Hive Prompt Standard section 6 — pack-derived case-wide coverage checklist."""
    coverage: ReaderCoverageExport = pack.readerCoverage
    document_types, focus, family_roles, relationships, vocab_count = _format_reader_coverage_lists(
        coverage
    )

    return f"""\
## 6. DOMAIN-AWARE COVERAGE CHECKLIST (case-wide)

Domain orientation: **{coverage.domainLabel}** (`domainId={pack.domainId}`).

This checklist uses Domain Pack export metadata (`readerCoverage` on study-agents/1 when present) for **what to look for** and **how to name** constructs.
Pack vocabulary, document types, and construct keys are **not evidence**. Every candidate fact still
requires an exact page quote from the untrusted document bundle (see §8).

### 6.1 Logical document types (from pack export)

When Engine 1 assigns a document type, examine the pages against the **Domain pack reader instructions** (top of this system prompt) and the
focus constructs in section 6.2 when that type typically carries them. Types defined for this domain:

{document_types}

### 6.2 Focus constructs and measurements (when evidenced)

When text supports them, propose facts using these pack-emphasized construct measures (snake_case):

{focus}

Also capture services, frequencies, session lengths, durations, settings, dates, periods, scores,
eligibility labels, and entity relationships whenever independently stated in the source.

**Outside pack lists:** Extract **every** source-supported atomic fact visible in the pages, including unexpected
content that does not match a pack document type, focus construct, or recognition term. Pack metadata orients
search and naming; it does **not** limit what you may propose when the document supports it. Use §7–§8 for
value shape and exact evidence on all facts equally.

### 6.3 Pack reader extraction guidance

Apply the **Domain pack reader instructions** section at the beginning of this system prompt on **every**
logical document. That block is authoritative for domain-specific reading behavior; this checklist only adds
case-wide coverage orientation—do not treat checklist bullets as a substitute for those instructions.

### 6.4 Structure map roles and relationships

Use trusted Engine 1 structure map **family roles** (for example prior vs current plan) and
**relationship kinds** when linking facts across documents:

Family roles:
{family_roles}

Relationship kinds:
{relationships}

### 6.5 Recognition vocabulary (naming only)

When normalizing labels in `construct` and `textValue`, use the domain pack's recognition vocabulary
(`readerCoverage.vocabulary` on the study-agents export when present; otherwise vocabulary named in the
Domain pack reader instructions). Abbreviations and domain-specific terms apply **only** when nearby page
text supports that meaning. Never propose a fact solely because a term appears in vocabulary or this checklist.
The committed Domain Pack export remains authoritative for the full term list ({vocab_count} terms in the
current export when `readerCoverage` is present).

### 6.6 Per-document examination workflow

For **each** logical document in the trusted manifest:

1. Read all pages (tools or provided bundle).
2. Map the document to the closest pack document type when known; still extract supported facts that fit no listed type.
3. Apply Domain pack reader instructions and walk sections 6.2–6.5: extract every source-supported atomic fact with exact evidence.
4. Note cross-document hooks (evaluations explaining present levels, progress tied to goals,
   amendments referencing plan dates, prior vs current plans) as separate facts with their own quotes.
5. Treat different plan periods as time-bounded facts; do not merge incompatible values across periods.

### 6.7 Final self-check (mandatory before returning candidateFacts)

For **each** logical document again:

- Re-scan pages for supported facts matching sections 6.1–6.3 and Domain pack reader instructions (constructs, measurements, services, dates,
  relationships, and **any other** supported statements) that are **not yet** in your candidate list.
- If supported text was missed, add the candidate with exact `sourceDocumentId`, `page`, and `quote`.
- If nothing additional is supported, leave the list unchanged for that document.
- Do **not** invent values, quotes, or facts to satisfy the checklist.
- Do **not** treat empty form rows, absent sections, or pack vocabulary as proof of a factual value.
"""


def build_parallel_document_domain_coverage_checklist(pack: AgentPack) -> str:
    """Hive Prompt Standard section 6 — document-scoped coverage for parallel-document (B-P6)."""
    coverage: ReaderCoverageExport = pack.readerCoverage
    document_types, focus, family_roles, relationships, vocab_count = _format_reader_coverage_lists(
        coverage
    )

    return f"""\
## 6. DOMAIN-AWARE COVERAGE CHECKLIST (this document only)

Domain orientation: **{coverage.domainLabel}** (`domainId={pack.domainId}`).

This parallel-document call receives **one** logical document's pages. Use Domain Pack export metadata
(`readerCoverage` on study-agents/1 when present) for **what to look for** and **how to name** constructs on
**these pages only**. Pack vocabulary, document types, and construct keys are **not evidence**. Every candidate
fact still requires an exact page quote from the untrusted document bundle (see §8).

### 6.1 Assigned document type (Engine 1)

Identify the **active** logical document from the untrusted bundle (`sourceDocumentId` on each page).
Read its Engine 1-assigned `documentType` from the trusted Engine 1 reader context or trusted manifest entry
for that same `sourceDocumentId`.

Apply coverage requirements **only** for that assigned type on **this document**. Do **not** apply another
logical document's type checklist, and do **not** require facts that belong only on other documents in the case.
Do **not** analyze, re-read, or self-check other logical documents in this call.

Pack-defined types for this domain (orientation when mapping Engine 1 labels — not a per-call requirement list):

{document_types}

### 6.2 Focus constructs and measurements (when evidenced on these pages)

When text on **these pages** supports them **and** the assigned document type typically carries them per Domain
pack reader instructions, propose facts using these pack-emphasized construct measures (snake_case):

{focus}

Also capture services, frequencies, session lengths, durations, settings, dates, periods, scores,
eligibility labels, and entity relationships whenever independently stated in the source on these pages.

**Outside pack lists:** Extract **every** source-supported atomic fact visible on these pages, including unexpected
content that does not match the assigned pack document type, focus construct, or recognition term. Pack metadata
orients search and naming; it does **not** limit what you may propose when the document supports it. Use §7–§8 for
value shape and exact evidence on all facts equally.

### 6.3 Pack reader extraction guidance

Apply the **Domain pack reader instructions** section at the beginning of this system prompt to **this document's
pages**. That block is authoritative for domain-specific reading behavior; this checklist only adds
document-scoped coverage orientation—do not treat checklist bullets as a substitute for those instructions.

### 6.4 Structure map metadata for this document only

If trusted Engine 1 context includes **family role** or **relationship** metadata for **this** `sourceDocumentId`,
you may use it when stating facts grounded on these pages.

Do **not** require cross-document relationship facts, prior vs current plan comparisons, or facts whose evidence
would belong on a different logical document. Downstream code merges parallel extractions; do not reconcile other
documents here.

Family roles (when present in trusted context for this document):
{family_roles}

Relationship kinds (when present in trusted context for this document):
{relationships}

### 6.5 Recognition vocabulary (naming only)

When normalizing labels in `construct` and `textValue`, use the domain pack's recognition vocabulary
(`readerCoverage.vocabulary` on the study-agents export when present; otherwise vocabulary named in the
Domain pack reader instructions). Abbreviations and domain-specific terms apply **only** when nearby page
text supports that meaning. Never propose a fact solely because a term appears in vocabulary or this checklist.
The committed Domain Pack export remains authoritative for the full term list ({vocab_count} terms in the
current export when `readerCoverage` is present).

### 6.6 Single-document examination workflow

For **this** logical document in the untrusted bundle:

1. Read all supplied pages (tools or provided bundle).
2. Confirm the Engine 1-assigned `documentType` for this `sourceDocumentId`.
3. Apply Domain pack reader instructions and sections 6.1–6.5 for **that type on these pages only**: extract
   every source-supported atomic fact with exact evidence.
4. Treat different dated statements on the same document as separate time-bounded facts when the source supports
   them; do not merge incompatible values.

### 6.7 Final self-check (mandatory before returning candidateFacts)

For **this document only** (the pages in the untrusted bundle — not other logical documents):

- Re-scan these pages for supported facts matching sections 6.1–6.3 and Domain pack reader instructions
  (constructs, measurements, services, dates, relationships on these pages, and **any other** supported
  statements) that are **not yet** in your candidate list.
- If supported text was missed, add the candidate with exact `sourceDocumentId`, `page`, and `quote`.
- If nothing additional is supported, leave the list unchanged.
- Do **not** invent values, quotes, or facts to satisfy the checklist.
- Do **not** treat empty form rows, absent sections, or pack vocabulary as proof of a factual value.
- Do **not** invoke tools or reasoning steps to analyze other logical documents for this self-check.
"""
