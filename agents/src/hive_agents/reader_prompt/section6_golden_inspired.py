from __future__ import annotations

from hive_agents.pack_loader import AgentPack, ReaderCoverageExport


def build_case_wide_domain_coverage_checklist(pack: AgentPack) -> str:
    """Hive Prompt Standard section 6 — pack-derived case-wide coverage checklist."""
    coverage: ReaderCoverageExport = pack.readerCoverage

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
