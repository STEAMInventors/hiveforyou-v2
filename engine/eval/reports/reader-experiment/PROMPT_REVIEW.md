# T3.9 Reader experiment — prompt review

No document text or student information in this file.

- Prompt version: `hive-reader-prompt/1.0.0`
- Variant A hash: `ae580790f08b2f7836655d1eaab52e795691a4f359e6585e12939385b9e37c1e`
- Variant B hash: `d0747e97e3c664e1c8e22028036e5f27aca689202a7f72c74ab4a212e267465c`

## Shared sections (1–5, 7–11)

Byte-identical across A and B (verified by review script).

## Section 6 — A (golden_inspired)

```text
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
```

## Section 6 — B (existing_reader_structured)

```text
## 6. DOMAIN EXTRACTION CHECKLIST

Read each logical document for IEP-relevant facts, not a generic summary.

In IEP plans, extract present levels (PLAAFP), measurable annual goals (including criteria, method, and schedule when stated), related services, accommodations and modifications, supplementary aids, LRE or placement, eligibility category, and transition content when present.

Treat service frequency, session length, and total duration as separate quantitative facts when the document states them separately. Treat special education and each related service as its own service line when listed.

In evaluation reports, capture instruments, scores or levels, dates, and recommendations that may explain plan language. In progress reports, capture reported results and the reporting period; tie wording to the goal or measure being reported.

Use modality to reflect whether text states a requirement, a decision, a plan, or observed implementation. Anchor time-sensitive claims with occurred-on or effective-period values from the document. Prefer exact goal and measure wording when proposing text values.

While reading each document, note cross-document hooks: evaluation results that explain present levels or goals, progress reports tied to a goal or reporting period, amendments or notices that reference an IEP date or prior plan, and prior vs current IEPs from the structure map.

When dates show an older plan was replaced, treat different goals, services, or placement as historical plan changes for their own periods—not as conflicting facts unless two sources disagree about the same period.

Note meaningful gaps visible in the document (empty rows, unspecified goal criteria, references to records not in the upload set) as candidates for missing-information items, not as facts the evidence establishes.
```
