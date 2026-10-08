# L001 golden reference: review notes

Status: **draft, not yet `verifiedBy`**. Built 2026-10-07 against `refactor/engine-boundary` @ `888e412`.

## Files

| File | What it is |
| --- | --- |
| `l001-golden.v4.json` | The golden, in `canonical-study-proposal/4` |
| `l001-golden.evidence-index.json` | Every evidence ref with its word range (`startSeq`–`endSeq`) in `engine/intake/fixtures/l001/document-pages` — seeds T1.2 `GoldenFact.wordRange` |
| `build_l001_golden.py` | Builder. Aborts if any quote is not a run of consecutive words on the cited page |

## Counts and checks

- 13 entities, 117 claims, 0 conflicts, 1 missing-information item, 256 evidence refs.
- All 256 quotes found as consecutive words on the cited page in the committed word layer.
- Uploaded PDFs are byte-identical to `engine/intake/fixtures/l001/*.pdf`.
- Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4`: SUCCEEDED, 117/117 claims accepted, 0 rejected (context with no logical documents).

## Inputs that were not supplied

- **Engine 1 inventory / logical-document manifest.** Source IDs follow the shadow harness rule in `load-case.ts` (no manifest → `l001-src-1`…`l001-src-8` in file order). `logicalDocumentId` is `null` everywhere. With a logical manifest present, the validator rejects every ref (`LOGICAL_DOCUMENT_REQUIRED`), so the real IDs must be filled in before this runs inside a live context. They were not invented.
- **Canonical-study schema** taken from `engine/shared/src/case-intelligence/4/`; methodology from `canonical-study-v4.1.md`; pack knowledge from `engine/domain-packs/iep`.
- `spanStart`/`spanEnd` and `extractionId` are `null`; location is page + quote. Word ranges live in the evidence index instead.

## Judgment calls to confirm

1. **No conflicts.** 86% vs "86 percent", the psychoeducational report's "does not assign a disability category" vs the later SLD determination, and the restated evaluation dates were checked and are not conflicts. L001 should be a zero-conflict tripwire.
2. **One gap: parent input.** The referral and evaluation plan both say parent input will be gathered; the psychoeducational source list and the eligibility evidence list omit it, and no document records it. Kept as `not_found_in_supplied_documents`.
3. **Not flagged as gaps** (rule 17: future-tense or general expectation, not evidence of absence): quarterly progress reports after 2024-11-12; sessions per week or session length for the 150 min/week service (the IEP gives only "Weekly"); service provider; consent for initial services; the "[Synthetic signature omitted]" fields. Reverse any of these if you want them as expected gaps.
4. **Deduplication.** One claim per fact, with every restatement as an extra ref (for example, 42 WCPM has refs in the academic evaluation, eligibility p1, eligibility p2 and IEP p1). The goal's baseline is a separate claim on the goal, plus a `baseline_source` link to the academic evaluation.
5. **Evaluation areas are atomic per document**: requested (referral), proposed (plan), consented (consent) — 3 × 3 claims.
6. **Grade 2** has no time anchor; giving it the Aug–Nov 2024 span would have been an inferred date.
7. **Two quotes repeat verbatim on SLP p1** (intelligibility and language sentences appear twice); the index points at the first occurrence.
8. **`otherPartyNoun` = "the district"** (from "Prepared By: District"). "The school" is also defensible.
