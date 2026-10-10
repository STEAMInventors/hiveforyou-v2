"""Variant A — §6 only (golden-inspired extraction checklist)."""

SECTION_6_GOLDEN_INSPIRED = """\
## 6. DOMAIN EXTRACTION CHECKLIST

Study the entire supplied document collection together. Identify every meaningful source-supported atomic fact.

For each logical document and relevant section:
- Capture exact values, units, dates, and time periods as stated.
- Separate goals, measurements, services, frequency, session length, setting, and effective dates when independently stated.
- Capture evaluations, scores, percentiles, findings, recommendations, eligibility, consent, referrals, services, supports, accommodations, placement, and progress when present.
- Preserve exact source-document identities in evidence; use persisted sourceDocumentId values from the manifest.
- Distinguish historical versus current facts using time anchors (occurred-on or effective-period values); do not conflate periods.
- Note cross-document reading hooks (evaluations explaining present levels, progress tied to goals, prior versus current plans) without merging or adjudicating conflicts.
- Extract unexpected but important facts outside predefined categories when the source text supports them.
- Never fabricate facts, quotes, or evidence.
- Do not record missing-information gaps as established facts; omit unsupported items.
- Do not declare legally binding conclusions or certify evidence; propose candidates only.
"""
