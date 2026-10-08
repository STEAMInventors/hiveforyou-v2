Status: verified by Aryya Bhattacharyya.

# L003 golden reference: review notes

Built 2026-10-08 against `refactor/engine-boundary` @ `888e412`, with the same method and layout as the L001 and L002 references. Domain: `iep`. Human-verified by Aryya Bhattacharyya; certified tune golden at `engine/eval/golden/tune/l003.json`.

## Files

| File | What it is |
| --- | --- |
| `l003-golden.v4.json` | The golden, in `canonical-study-proposal/4`, `domainId: "iep"` |
| `l003-golden.evidence-index.json` | Every evidence ref with source, page, quote, verified word range (`startSeq`–`endSeq`) and `occurrencesOnPage`, plus the SHA-256 of each source. Seeds T1.2 `GoldenFact.wordRange` |
| `l003-golden.REVIEW.md` | These notes |
| `build_l003_golden.py` | Reference / provenance builder. Reads the Hive word layer, checks hashes, aborts if any quote is not consecutive words on its cited page or occurs more than once there, writes the two JSON files. Not runtime or grader code |

Rebuild: `python3 -I build_l003_golden.py <corpus dir> <out dir>`. Committed corpus: `engine/intake/fixtures/l003/` (five PDFs, `manifest.json`, `document-pages/*.json`).

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 9 (student, school, district, 5 source records, 1 annual goal) |
| Claims | 86 (53 `observed`, 22 `decided`, 9 `planned`, 2 `required`) |
| Conflicts | 0 |
| Missing-information items | 1 |
| Evidence refs | 194 (18 on entities, 175 on claims, 1 on the voice proposal) |
| Quotes verified as consecutive words on the cited page | 194 |
| Quotes not verified | 0 |
| Quotes occurring more than once on their page | 0 (repeated sentences were quoted with enough context to be unique) |

- **Source identity.** The five PDFs, `manifest.json`, and `document-pages/` are committed at `engine/intake/fixtures/l003/`. SHA-256 values are in the evidence index and match the manifest and PDF bytes.
- **Word layer.** Committed snapshots from Hive's own path: `buildDocumentPagesFromPdf` in `ensure-document-pages.ts` (`extractNativeWords`, same as the worker's `DocumentPagesStorage`). 7 pages, all `route: native`. Matching uses the same normalization as `normalize-quote-text.ts`.
- **Schema validation.** Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4` with a five-source context and no logical documents: `SUCCEEDED`, accepted 9/9 entities, 86/86 claims, 1/1 gap; 0 rejections, warnings or provenance, integrity or validation errors.
- With logical documents present in the context, every ref is rejected (`LOGICAL_DOCUMENT_REQUIRED`), as expected, because `logicalDocumentId` is null. Same behavior as L001 and L002.
- No two claims share subject, measure and task.

## Source-document map

| Source ID | File | Pages | Document date |
| --- | --- | --- | --- |
| `l003-src-1` | `01_prior_annual_iep.pdf` | 2 | 2025-09-15 |
| `l003-src-2` | `02_progress_report.pdf` | 1 | 2026-01-23 |
| `l003-src-3` | `03_iep_team_meeting_notes.pdf` | 1 | 2026-03-04 |
| `l003-src-4` | `04_iep_amendment_summary.pdf` | 1 | 2026-03-18 |
| `l003-src-5` | `05_final_amended_iep.pdf` | 2 | 2026-03-25 |

There are no production `sourceDocumentId` values to cross-reference, because this corpus has never been run through Hive.

## Inputs that were not supplied

- **Logical-document manifest (Engine 1).** Not supplied. `logicalDocumentId` is `null` on every ref; none were invented. They must be filled in before this golden runs inside a live study context.
- **Committed document-pages layer.** Present at `engine/intake/fixtures/l003/document-pages/` in the same `stableJson` format `ensure-document-pages.ts` uses.
- **Unavailable identifiers.** No extraction IDs (`extractionId: null`) and no character spans (`spanStart`/`spanEnd: null`); location is page + quote, with word ranges in the index.
- **Customer context.** No user text, stated intent or Q&A, so `voiceProposal.subject`, `eventNoun` and `helperNoun` are null.

## Case interpretation

One IEP period (2025-09-15 to 2027-03-24), amended once. The only operative change is the specialized reading frequency.

| Date | Source | What it establishes |
| --- | --- | --- |
| 2025-09-15 | src-1 | Annual IEP. SLD - Reading; GOAL_READING (≥95% word-reading accuracy, three consecutive probes); specialized reading 5 sessions/week × 45 minutes, special education setting, starting 2025-09-15; extended time 1.5x; text-to-speech |
| 2026-01-23 | src-2 | 88 WCPM oral reading fluency, reported against GOAL_READING. Changes nothing in the IEP |
| 2026-03-04 | src-3 | Team discussed 5 → 3 sessions/week and more general education time. Explicitly not an amendment; IEP unchanged; no start date |
| 2026-03-18 | src-4 | Status "Proposed amendment": 3x/week for 45 minutes. Explicitly sets no start date and says a final amended IEP is required |
| 2026-03-25 | src-5 | Final amended IEP: 3 sessions/week × 45 minutes, special education setting, **service start 2026-04-01**. States that the IEP date is not the service start date. Everything else repeated unchanged |

How this is encoded:
- **Service, before and after.** Each IEP has its own `service_frequency` claim. The 2025 claim carries `effectivePeriod` start 2025-09-15 with **no end**, because no document states an end date for it. The 2026 claim carries 2026-04-01 to 2027-03-24. The meeting notes and amendment summary confirm 5 sessions/week was still in effect on 2026-03-04 and 2026-03-18; those sentences are extra refs on the 2025 claims, not new claims.
- **Proposals and discussions** are claims on the document that records them: `team_discussion` (src-3) and `proposed_service_frequency` (src-4), never on the student or an IEP.
- **Restated content is deduplicated.** Eligibility category, determination date, primary need, present-levels statements and every goal attribute appear once, with refs from each document that restates them. The amended IEP made no new eligibility determination (Determination Date is still 2025-09-15; category "remains").
- **IEP-level content is per IEP.** Accommodations, nonparticipation, assessment participation, team roles, IEP period and the goal link are separate claims on each IEP entity, with the same value. Same treatment as L002's two IEPs.

## Judgment calls to confirm

1. **One gap: word-reading accuracy.** The goal's criterion is word-reading accuracy, and both IEPs list "word-reading accuracy probes" as a measurement method. No accuracy figure appears anywhere: no baseline and no probe result. The basis for expecting it is the case's own goal, not general IEP practice.
2. **88 WCPM is linked to the goal, but not as progress on its metric.** src-2 monitors GOAL_READING and says it "records current progress toward the existing annual goal", so `goal_monitored` points at the goal. The 88 WCPM is an `oral_reading_fluency` claim on the student. There is no `progress_toward_goal` or `goal_target_met` claim, because the report gives no accuracy figure and makes no statement about the 95% target. A pipeline that writes "88% of the target" or "below 95%" is wrong.
3. **Modality of the amendment-summary proposed service frequency (`clm_063`, 3x/week) is `planned`.** The amendment summary explicitly records a *proposed* future frequency; the adopted service appears on the final amended IEP (`decided`). The two "a written amendment / final amended IEP is required" statements remain `required`.
4. **The meeting discussions are `observed`** (the notes record that a discussion happened). `/4` has no "discussed" modality.
5. **No `amends` claim from src-5 to src-1.** src-5 says it is a "Final amended IEP" with the same IEP period, but never names src-1 as the IEP it amends. The link is left to the reader rather than asserted.
6. **No end date on the 5 sessions/week service.** 2026-03-31 would be an inference. The 2026-04-01 start of the amended service carries the change.
7. **`otherPartyNoun` is null.** L001 and L002 used "the district" from "Prepared By: District". No L003 document is prepared by the district (src-2 and src-3 are prepared by the special education teacher), so nothing supports it.
8. **Units are copied, not normalized.** "5 sessions per week" and "three sessions each week" → `sessions/week`; "3x/week" → `times/week`.

## Unreadable or uncertain content

None. All 7 pages are native text with no illegible regions, redactions or images carrying content. No value was reconstructed.

## Deliberately not treated as conflicts

- 5 sessions/week (2025 IEP) vs 3 sessions/week (amended IEP from 2026-04-01): a dated amendment, not a disagreement.
- 3x/week proposed (src-4) vs three sessions each week (src-5): the same value, proposed and then adopted.
- 88 WCPM vs the 95% word-reading accuracy target: different measures.
- Present levels: src-1 says no ORF score is reported; src-5 cites 88 WCPM. Different dates; src-5 explains its source.
- src-1 "Isolated word reading is stronger than reading of connected passages" is not repeated in src-5. An omission, not a contradiction.
- Text-to-speech described for "instructional text" yet included in "the accommodations listed" for state and districtwide assessments. An ambiguity of scope, not a conflict between documents.

## Deliberately not treated as gaps

- **Increased general education time.** Discussed (src-3), referenced (src-4), not written into src-5, whose nonparticipation statement is word for word the same as src-1's. Nothing says it was decided, so it is not missing. It is a good parent question.
- **A prior written notice.** src-3 says it is "not a prior written notice". That does not establish that one is expected in this record.
- **A second progress report.** Reporting is "at least annually"; one report is supplied within the period.
- **Team signatures.** Marked "[Synthetic signature omitted]"; synthetic record.

## Tripwires for the grader

A pipeline output that does any of these is wrong on this case:

1. Treats 3 sessions/week as operative from src-3 or src-4, or before 2026-04-01.
2. Gives 2026-03-25 (the amended IEP date) as the service start date.
3. Reports 88 WCPM as a percentage, as accuracy, or as progress toward the 95% target.
4. Reports a conflict between 5 and 3 sessions/week.
5. Says the goal, eligibility, accommodations, session length, location or IEP period changed.
6. Reports an ORF administration on 2026-03-18 or 2026-03-25, or any ORF score other than 88 WCPM.
7. Calls SLD a medical diagnosis.
8. States a baseline value for word-reading accuracy or ORF at the 2025-09-15 IEP.
9. Says increased general education time was adopted or implemented.
10. Flags a missing prior written notice, consent, evaluation, second progress report or signatures.

## Questions a reviewer could expect the pipeline to raise

- The goal is measured by word-reading accuracy, but the January report gives a fluency score. What have the accuracy probes shown? (gap_001)
- From April 1, 2026, specialized reading goes from five to three 45-minute sessions a week. The amended IEP doesn't say where Sofia is during the two freed sessions; the team had discussed more general education time.
- Does text-to-speech apply on state and districtwide assessments, or only to instructional text?
