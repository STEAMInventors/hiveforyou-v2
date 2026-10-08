Status: verified by Aryya Bhattacharyya.

# L006 golden reference: review notes

Built 2026-10-08 against `refactor/engine-boundary` @ `888e412`, with the same method and layout as the L001–L005 references. Domain: `iep`. Human-verified by Aryya Bhattacharyya; certified holdout golden at `engine/eval/golden/holdout/l006.json`.

## Files

| File | What it is |
| --- | --- |
| `l006-golden.v4.json` | The golden, in `canonical-study-proposal/4`, `domainId: "iep"` |
| `l006-golden.evidence-index.json` | Every evidence ref with source, page, quote, verified word range (`startSeq`–`endSeq`) and `occurrencesOnPage`, plus the SHA-256 of each source. Seeds T1.2 `GoldenFact.wordRange` |
| `l006-golden.REVIEW.md` | These notes |
| `build_l006_golden.py` | Reference / provenance builder. Reads the Hive word layer, checks hashes, aborts if any quote is not consecutive words on its cited page or occurs more than once there, writes the two JSON files. Not runtime or grader code |

Rebuild: `python3 -I build_l006_golden.py <corpus dir> <out dir>`. Committed corpus: `engine/intake/fixtures/l006/` (nine PDFs, `manifest.json`, `document-pages/*.json`). Certified holdout golden: `engine/eval/golden/holdout/l006.json` (`verifiedBy` Aryya Bhattacharyya, `draft: false`).

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 14 (student, school, district, 9 source records, 2 annual goals) |
| Claims | 203 (123 `observed`, 48 `decided`, 32 `planned`) |
| Conflicts | 0 |
| Missing-information items | 1 |
| Evidence refs | 385 (26 on entities, 358 on claims, 1 on the voice proposal) |
| Quotes verified as consecutive words on the cited page | 385 |
| Quotes not verified | 0 |
| Quotes occurring more than once on their page | 0 (sentences the documents repeat were quoted with a neighboring word to pin the occurrence) |

- **Source identity.** The nine PDFs, `manifest.json`, and `document-pages/` are committed at `engine/intake/fixtures/l006/`. SHA-256 values are in the evidence index and match the manifest and PDF bytes.
- **Word layer.** Committed snapshots from Hive's own path: `buildDocumentPagesFromPdf` in `ensure-document-pages.ts` (`extractNativeWords`, same as the worker's `DocumentPagesStorage`). 23 pages, all `route: native`. Matching uses the same normalization as `normalize-quote-text.ts`.
- **Schema validation.** Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4` with a nine-source context and no logical documents: `SUCCEEDED`, accepted 14/14 entities, 203/203 claims, 1/1 gap; 0 rejections, warnings or validation or integrity errors.
- With logical documents present in the context, every ref is rejected (`LOGICAL_DOCUMENT_REQUIRED`), as expected, because `logicalDocumentId` is null. Same behavior as L001–L005.
- No two claims share subject, construct, date and period.

## Source-document map

| Source ID | File | Pages | Document date |
| --- | --- | --- | --- |
| `l006-src-1` | `01_prior_annual_iep.pdf` | 3 | 2025-08-18 |
| `l006-src-2` | `02_classroom_behavior_tracking.pdf` | 3 | 2025-10-03 |
| `l006-src-3` | `03_behavior_incident_summary.pdf` | 2 | 2025-10-07 |
| `l006-src-4` | `04_functional_behavior_assessment.pdf` | 3 | 2025-10-24 |
| `l006-src-5` | `05_behavior_intervention_plan.pdf` | 3 | 2025-11-03 |
| `l006-src-6` | `06_prior_written_notice.pdf` | 1 | 2025-11-12 |
| `l006-src-7` | `07_iep_amendment.pdf` | 2 | 2025-11-14 |
| `l006-src-8` | `08_behavior_progress_report.pdf` | 2 | 2026-01-30 |
| `l006-src-9` | `09_current_annual_iep.pdf` | 4 | 2026-03-16 |

## Inputs that were not supplied

- **Logical-document manifest (Engine 1).** Not supplied. `logicalDocumentId` is `null` on every ref; none were invented.
- **Committed document-pages layer.** Present at `engine/intake/fixtures/l006/document-pages/` in the same `stableJson` format `ensure-document-pages.ts` uses.
- **Unavailable identifiers.** `extractionId`, `spanStart` and `spanEnd` are null; location is page + quote, with word ranges in the index.
- **Customer context.** No user text, stated intent or Q&A, so `voiceProposal.subject`, `eventNoun` and `helperNoun` are null. `otherPartyNoun` is null: no document is prepared by the district (the incident summary is prepared by the classroom team).

## Case interpretation

A behavior cycle layered on an unchanged reading program: observation data → FBA → BIP → PWN → partial amendment → progress report → new annual IEP that consolidates everything.

| Date | Source | What it establishes |
| --- | --- | --- |
| 2025-08-18 | src-1 | Annual IEP. OHI; reading comprehension; GOAL_READING (55% → 80%); specialized reading 5 × 45 min; extended time, preferential seating. Explicitly no behavior goal, plan, consultation, accommodations or self-regulation need |
| 2025-09-08 – 10-03 | src-2, src-3 | 17 task-refusal episodes over 4 instructional weeks = 4.25/week; 13 language arts, 3 social studies, 1 science lab; none in 3 small-group math observations; no aggression; no suspension |
| 2025-10-24 | src-4 | FBA: antecedent = difficult independent written tasks; hypothesized function = escape or avoidance (a hypothesis, explicitly not a fact or diagnosis); brief break is a possible support, not an accommodation |
| 2025-11-03 | src-5 | BIP: prevention, replacement (help/break card), teaching, reinforcement, adult response. Measure A baseline 4.25/week; Measure B task initiation baseline approximately 52% |
| 2025-11-12 | src-6 | PWN: proposes BIP implementation, partial amendment, 3 supports and behavior consultation 1 × 20 min; rejected option: continue without a plan |
| 2025-11-14 | src-7 | Partial amendment: GOAL_BEHAVIOR (4.25 → ≤1/week for 4 consecutive weeks, target 2026-08-17); 3 supports; behavior consultation 1 × 20 min from 2025-11-14. Unrestated provisions stay in effect |
| 2026-01-30 | src-8 | Measure A 2.0/week; Measure B 78%; goal criterion not yet demonstrated; staff fidelity 85% |
| 2026-03-16 | src-9 | New annual IEP (Grade 7) superseding src-1 + src-7. Adds self-regulation need; behavior baseline updated to 2.0; both goals continued with target date 2027-03-15; same services; nonparticipation now includes behavior-consultation sessions; 5 accommodations; BIP remains current |

How this is encoded:
- **Two behavior series, never merged.** `task_refusal_frequency` (4.25 → 2.0 episodes/week) and `task_initiation` (approximately 52% → 78%) are separate measures, each with its own baseline and progress claim.
- **4.25/week is one claim** with refs from the log, summary, FBA, BIP, amendment and progress report; it carries the observation window as its period.
- **Goal baselines are per IEP document.** GOAL_BEHAVIOR has two `goal_baseline` claims: 4.25 (amendment) and 2.0 (2026 IEP, which says 2.0 "supersedes the earlier… baseline of 4.25 episodes per week for the new goal period while retaining the historical sequence"). Both goals have two `goal_target_date` claims (2026-08-17 and 2027-03-15), distinguished by `administration`.
- **Proposals vs decisions.** PWN items are `observed` `proposed_action` claims on the PWN; the amendment's items are `decided`; the BIP's strategies are `planned`. The same support appears in all three, as three different kinds of claim.
- **Every "not" statement the documents make is captured**, because each one guards against a tripwire: no behavior plan in 2025; the 30-second threshold is a coding cutoff; the 4-week window is not an incident count; observations are not services; the help/break card is not service minutes; a brief break is not an accommodation; the BIP is not evidence of outcome; the PWN is not the amendment; fidelity is not student performance; the 2.0 baseline does not mean the goal is met.

## Judgment calls to confirm

1. **One gap: no reading-comprehension progress since the 55% baseline.** The 2025 IEP promises reporting at least as often as report cards; the 2026 IEP continues GOAL_READING (target date extended to 2027-03-15) without any reading data. The only progress report covers behavior. The basis is the IEP's own reporting commitment.
2. **The 17 rows of the tracking log are not individual claims.** The golden keeps the aggregates (17, 4.25/week, 13/3/1 by setting, none in math) and the documented patterns (resumed after some episodes, not others). Each row is still in the evidence layer. If you want episode-level grading, these would add about 50 claims (date, setting, behavior, duration, resumed).
3. **"Approximately 52%" is stored as text**, not as the number 52, because the BIP says "approximately" and the prompt bars converting approximate language into an exact value. The 78% is stored as a number.
4. **The 2026 IEP's service start dates (2025-08-18, 2025-11-14) are `observed`**, not `decided`, because they repeat when each service began rather than decide anything new.
5. **PWN modality.** Its proposed actions are `observed` (the notice records the proposals), consistent with L003's amendment summary. The decided versions are the amendment's claims.
6. **Self-regulation need: two claims.** "Not identified" in 2025 (`observed`, false) and "Self-regulation / task engagement" in 2026 (`decided`). A dated change, not a conflict.
7. **No conflict on nonparticipation.** 2025: outside general education during specialized reading. 2026: also during behavior-consultation sessions. The later IEP supersedes the earlier one, and the change follows from the added service.
8. **Eligibility: one determination.** The 2026 IEP keeps Determination Date 2025-08-18 and says eligibility is unchanged; no reevaluation is recorded.

## Unreadable or uncertain content

None. All 23 pages are native text. Sentences that run across a page break (FBA p2→p3, "Available observations were concentrated…") are quoted from their complete repeat on p3.

## Deliberately not treated as conflicts

- 4.25 vs 2.0 episodes per week: chronological progress, as src-8 says; and the baseline update in src-9 is explicit.
- Approximately 52% vs 78% task initiation: chronological progress on a separate construct.
- Any frequency value vs any percentage: different constructs, as src-5, src-8 and src-9 say.
- Independent written work (17 episodes) vs small-group math (none): a context difference, as src-2, src-3 and src-4 say.
- Goal target dates 2026-08-17 vs 2027-03-15: set by different IEP documents.
- Grade 6 (2025 documents) vs Grade 7 (2026 IEP).
- Nonparticipation wording (judgment call 7), self-regulation need (judgment call 6).

## Deliberately not treated as gaps

- **Eligibility, specialized reading and extended time missing from the amendment.** The amendment says their absence "is not a removal, discontinuation, or missing-field finding".
- **A reevaluation or new eligibility determination.** None is referenced as due.
- **A second behavior progress report.** The BIP review is "at least once each grading period"; one report is supplied and nothing in the record shows another is outstanding by 2026-03-16.
- **Individual episode durations or staff names.** Recorded in the log as-is; no names exist.
- **Team signatures.** "[Synthetic signature omitted]"; synthetic record.

## Tripwires for the grader

A pipeline output that does any of these is wrong on this case:

1. Merges task-refusal frequency and task-initiation percentage into one series, or compares 52% or 78% with 4.25 or 2.0.
2. Reports 85% (staff fidelity) as a student score.
3. Says GOAL_BEHAVIOR was met, or reads the 2.0 baseline as goal attainment.
4. States the hypothesized function as fact, motivation or diagnosis.
5. Calls OHI, or anything in the FBA, a medical diagnosis.
6. Reports a suspension or physical aggression.
7. Treats the 20-minute observation or the 1:1 observation as a service, or the help/break card as service minutes.
8. Treats the brief break as an IEP accommodation.
9. Says the amendment removed specialized reading, extended time or eligibility.
10. Treats the BIP's strategies, or the PWN, as evidence the intervention worked.
11. Reports "remove independent written work from the curriculum" as a BIP strategy (it is unchecked).
12. Reads the 30-second threshold as an episode duration, or the 4-week window as an incident count.
13. Reports a conflict between independent written work and small-group math, or between 4.25 and 2.0.
14. States task-initiation baseline as exactly 52%.
15. Reports a new behavior measurement on 2026-03-16.
16. Says a behavior plan, goal or consultation existed in the 2025-08-18 IEP before the amendment.

## Questions a reviewer could expect the pipeline to raise

- Task refusal dropped from 4.25 to 2.0 episodes a week, and starting work within 2 minutes rose from about 52% to 78%. The goal is 1 or fewer for four weeks in a row. What is the plan if progress stalls?
- No reading-comprehension results are reported after the 55% baseline, although the reading goal continues to March 2027. What have the comprehension probes shown? (gap_001)
- The FBA suggested a brief break on request might help, and the BIP's help/break card covers it. Is the break itself written into the IEP, or only the card?
