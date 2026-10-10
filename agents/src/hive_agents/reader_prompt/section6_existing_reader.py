"""Variant B — §6 only (structured existing IEP pack reader guidance)."""

# Semantics match engine/domain-packs/iep/study/agents.ts reader string; reorganized as checklist.
SECTION_6_EXISTING_READER = """\
## 6. DOMAIN EXTRACTION CHECKLIST

Read each logical document for IEP-relevant facts, not a generic summary.

In IEP plans, extract present levels (PLAAFP), measurable annual goals (including criteria, method, and schedule when stated), related services, accommodations and modifications, supplementary aids, LRE or placement, eligibility category, and transition content when present.

Treat service frequency, session length, and total duration as separate quantitative facts when the document states them separately. Treat special education and each related service as its own service line when listed.

In evaluation reports, capture instruments, scores or levels, dates, and recommendations that may explain plan language. In progress reports, capture reported results and the reporting period; tie wording to the goal or measure being reported.

Use modality to reflect whether text states a requirement, a decision, a plan, or observed implementation. Anchor time-sensitive claims with occurred-on or effective-period values from the document. Prefer exact goal and measure wording when proposing text values.

While reading each document, note cross-document hooks: evaluation results that explain present levels or goals, progress reports tied to a goal or reporting period, amendments or notices that reference an IEP date or prior plan, and prior vs current IEPs from the structure map.

When dates show an older plan was replaced, treat different goals, services, or placement as historical plan changes for their own periods—not as conflicting facts unless two sources disagree about the same period.

Note meaningful gaps visible in the document (empty rows, unspecified goal criteria, references to records not in the upload set) as candidates for missing-information items, not as facts the evidence establishes.
"""
