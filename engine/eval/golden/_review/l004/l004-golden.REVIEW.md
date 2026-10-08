Status: verified by Aryya Bhattacharyya.

# L004 golden reference: review notes

Built 2026-10-08 against `refactor/engine-boundary` @ `888e412`, with the same method and layout as the L001–L003 references. Domain: `iep`. Human-verified by Aryya Bhattacharyya; certified holdout golden at `engine/eval/golden/holdout/l004.json`.

## Files

| File | What it is |
| --- | --- |
| `l004-golden.v4.json` | The golden, in `canonical-study-proposal/4`, `domainId: "iep"` |
| `l004-golden.evidence-index.json` | Every evidence ref with source, page, quote, verified word range (`startSeq`–`endSeq`) and `occurrencesOnPage`, plus the SHA-256 of each source. Seeds T1.2 `GoldenFact.wordRange` |
| `l004-golden.REVIEW.md` | These notes |
| `build_l004_golden.py` | Reference / provenance builder. Reads the Hive word layer, checks hashes, aborts if any quote is not consecutive words on its cited page or occurs more than once there, writes the two JSON files. Not runtime or grader code |

Rebuild: `python3 -I build_l004_golden.py <corpus dir> <out dir>`. Committed corpus: `engine/intake/fixtures/l004/` (five PDFs, `manifest.json`, `document-pages/*.json`). Certified holdout golden: `engine/eval/golden/holdout/l004.json` (`verifiedBy` Aryya Bhattacharyya, `draft: false`).

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 9 (student, school, district, 5 source records, 1 annual goal) |
| Claims | 80 (62 `observed`, 12 `decided`, 6 `planned`) |
| Conflicts | 0 |
| Missing-information items | 1 |
| Evidence refs | 173 (18 on entities, 154 on claims, 1 on the voice proposal) |
| Quotes verified as consecutive words on the cited page | 173 |
| Quotes not verified | 0 |
| Quotes occurring more than once on their page | 0 (repeated sentences were quoted with enough context to be unique) |

- **Source identity.** The five PDFs, `manifest.json`, and `document-pages/` are committed at `engine/intake/fixtures/l004/`. SHA-256 values are in the evidence index and match the manifest and PDF bytes.
- **Word layer.** Committed snapshots from Hive's own path: `buildDocumentPagesFromPdf` in `ensure-document-pages.ts` (`extractNativeWords`, same as the worker's `DocumentPagesStorage`). 7 pages, all `route: native`. Matching uses the same normalization as `normalize-quote-text.ts`.
- **Schema validation.** Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4` with a five-source context and no logical documents: `SUCCEEDED`, accepted 9/9 entities, 80/80 claims, 1/1 gap; 0 rejections, warnings or validation, integrity or provenance errors.
- With logical documents present in the context, every ref is rejected (`LOGICAL_DOCUMENT_REQUIRED`), as expected, because `logicalDocumentId` is null. Same behavior as L001–L003.
- No two claims share subject, construct and date.

## Source-document map

| Source ID | File | Pages | Document date |
| --- | --- | --- | --- |
| `l004-src-1` | `01_annual_iep.pdf` | 2 | 2025-09-10 |
| `l004-src-2` | `02_progress_report_q1.pdf` | 1 | 2025-11-14 |
| `l004-src-3` | `03_progress_report_q2.pdf` | 1 | 2026-02-13 |
| `l004-src-4` | `04_progress_report_q3.pdf` | 1 | 2026-05-15 |
| `l004-src-5` | `05_academic_evaluation.pdf` | 2 | 2026-06-05 |

## Inputs that were not supplied

- **Logical-document manifest (Engine 1).** Not supplied. `logicalDocumentId` is `null` on every ref; none were invented.
- **Committed document-pages layer.** Present at `engine/intake/fixtures/l004/document-pages/` in the same `stableJson` format `ensure-document-pages.ts` uses.
- **Unavailable identifiers.** No extraction IDs (`extractionId: null`) and no character spans (`spanStart`/`spanEnd: null`); location is page + quote, with word ranges in the index.
- **Customer context.** No user text, stated intent or Q&A, so `voiceProposal.subject`, `eventNoun` and `helperNoun` are null.

## Case interpretation

One IEP (2025-09-10 to 2026-09-09), one goal, one service, never amended. The case is a measurement series.

| Date | Source | Oral reading fluency | Administration |
| --- | --- | --- | --- |
| 2025-09-10 | src-1 | 70 WCPM | `present_levels_baseline` (also the goal's `goal_baseline`) |
| 2025-11-14 | src-2 | 78 WCPM | `progress_monitoring` (Q1) |
| 2026-02-13 | src-3 | 85 WCPM | `progress_monitoring` (Q2) |
| 2026-05-15 | src-4 | 92 WCPM | `progress_monitoring` (Q3) |
| 2026-06-05 | src-5 | 96 WCPM | `academic_evaluation` |
| 2026-06-05 | src-5 | Reading accuracy 94% | `academic_evaluation`; a separate construct (`reading_accuracy`), never in the ORF series |

How this is encoded:
- **Five ORF claims, one per administration date.** Each has its own `occurredOn`. They form a rising series, not conflicts or duplicates.
- **The 70 WCPM baseline is one claim**, cited from src-1 (four places) and src-5, which calls it "historical present-level evidence" and states it does not create a new 70 WCPM administration.
- **The 95 WCPM target is a `planned` goal claim**, plus an `observed` claim that the IEP says it "is not a measured oral reading fluency result".
- **Goal attributes are one claim each**, with refs from the IEP and all three progress reports.
- **Service**: 4 sessions/week × 30 minutes, special education setting, 2025-09-10 to 2026-09-09. The IEP says session length "is not the overall service period"; that is its own claim.

## Judgment calls to confirm

1. **One gap: no progress report after Q3.** The IEP promises reporting "at least quarterly" through 2026-09-09. Q1, Q2 and Q3 are supplied (2025-11-14, 2026-02-13, 2026-05-15); nothing covers 2026-05-16 to 2026-09-09. The basis is the IEP's own reporting commitment and the Q1–Q3 labels, not general practice. The 2026-06-05 evaluation is not a goal-progress report (it says its results "are evaluation findings"). Remove the gap if you consider a Q4 report outside what this record should contain.
2. **No `goal_target_met` claim.** 96 WCPM on 2026-06-05 is numerically above the 95 WCPM target, but no document says the goal was met. The evaluation is a different administration from the goal's "curriculum-based oral reading fluency probes", and the goal is to be judged "by the annual review date". The golden therefore records the two numbers and no verdict. A pipeline that says "goal met" or "goal mastered" is asserting something the record does not.
3. **The annual review / next IEP is not a gap.** The IEP period ended 2026-09-09 and the goal refers to "the annual review date", but no supplied document says a review was held or a new IEP written, and rule 17 bars inferring missing records. Same treatment as L002's uncovered period. If you want it, it is a `not_found_in_supplied_documents` gap on `ent_iep_2025`. For a parent it is the most consequential absence.
4. **The evaluation's interpretation is kept as observed statements**, e.g. "fluency rose from a 70 WCPM baseline to 96 WCPM" and "96 WCPM continues the series". These are the evaluator's words, not golden reasoning.
5. **The evaluation recommendation** ("Continue specialized reading instruction under the current IEP") is an `observed` `evaluation_recommendation` on the evaluation entity, as in L002. It is not an IEP decision; the report says so.
6. **Eligibility is one claim** (2025-09-10), with src-5's "Current educational eligibility remains…" as a second ref. The evaluation makes no new determination.
7. **`otherPartyNoun` is null.** No document is prepared by the district.
8. **Quarterly receipt of service** is three `receives_service` claims, one per progress report, distinguished by `administration` (`current_iep_q1_report`, etc.) and `occurredOn`.

## Unreadable or uncertain content

None. All 7 pages are native text with no illegible regions or redactions. No value was reconstructed.

## Deliberately not treated as conflicts

- 70 → 78 → 85 → 92 → 96 WCPM: one series over five dates.
- 96 WCPM measured vs 95 WCPM target: a measurement against a goal reference, not a disagreement.
- 92 WCPM (Q3, progress probe, 2026-05-15) vs 96 WCPM (evaluation, 2026-06-05): different dates and administrations.
- 94% reading accuracy vs any WCPM value: different constructs, as the evaluation states.
- IEP date and baseline date are both 2025-09-10: the IEP itself says they are recorded separately.
- "30 minutes per session" vs the service period: the IEP says session length is not the service period.

## Deliberately not treated as gaps

- **Annual review / next IEP after 2026-09-09** (judgment call 3).
- **An accuracy baseline or accuracy goal.** The goal is fluency only; nothing in the record calls for an accuracy measure before 2026-06-05.
- **A mastery criterion.** The goal has none, and none is referenced.
- **Team signatures.** "[Synthetic signature omitted]"; synthetic record.

## Tripwires for the grader

A pipeline output that does any of these is wrong on this case:

1. Says the goal was met, mastered or achieved.
2. Reports 95 WCPM as a measured result.
3. Reports a 70 WCPM administration on 2026-06-05.
4. Puts 94% accuracy in the ORF series, or reads it as WCPM or as "94% of the target".
5. Reports a conflict among 70, 78, 85, 92 and 96 WCPM, or between 96 and 95.
6. Treats 30 minutes as the service period or duration of the IEP.
7. Reports any change to eligibility, services, accommodations or the goal.
8. Presents the evaluation recommendation as an IEP decision.
9. Calls SLD a medical diagnosis.

## Questions a reviewer could expect the pipeline to raise

- Daniel read 96 words correct per minute on the June evaluation; the goal is 95 by the annual review. Has the team said whether the goal is met, and what the next goal will be?
- The IEP promises progress reports at least quarterly. Is there a report after May 15, 2026? (gap_001)
- The IEP period ended September 9, 2026. Has a new IEP been written?
