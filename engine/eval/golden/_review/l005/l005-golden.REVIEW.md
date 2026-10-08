Status: verified by Aryya Bhattacharyya.

# L005 golden reference: review notes

Built 2026-10-08 against `refactor/engine-boundary` @ `888e412`, with the same method and layout as the L001–L004 references. Domain: `iep`. Human-verified by Aryya Bhattacharyya; certified tune golden at `engine/eval/golden/tune/l005.json`.

## Files

| File | What it is |
| --- | --- |
| `l005-golden.v4.json` | The golden, in `canonical-study-proposal/4`, `domainId: "iep"` |
| `l005-golden.evidence-index.json` | Every evidence ref with source, page, quote, verified word range (`startSeq`–`endSeq`) and `occurrencesOnPage`, plus the SHA-256 of each source. Seeds T1.2 `GoldenFact.wordRange` |
| `l005-golden.REVIEW.md` | These notes |
| `build_l005_golden.py` | Reference / provenance builder. Reads the Hive word layer, checks hashes, aborts if any quote is not consecutive words on its cited page or occurs more than once there, writes the two JSON files. Not runtime or grader code |

Rebuild: `python3 -I build_l005_golden.py <corpus dir> <out dir>`. Committed corpus: `engine/intake/fixtures/l005/` (six PDFs, `manifest.json`, `document-pages/*.json`). Provenance was re-run against that fixture on 2026-10-08; regenerated output matched this review package with zero semantic differences.

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 11 (student, school, district, 6 source records, 2 annual goals) |
| Claims | 123 (85 `observed`, 25 `decided`, 13 `planned`) |
| Conflicts | 0 |
| Missing-information items | 1 |
| Evidence refs | 208 (19 on entities, 187 on claims, 2 on the voice proposal) |
| Quotes verified as consecutive words on the cited page | 208 |
| Quotes not verified | 0 |
| Quotes occurring more than once on their page | 0 (sentences the documents repeat were quoted with a neighboring word to pin the occurrence) |

- **Source identity.** The six PDFs, `manifest.json`, and `document-pages/` are committed at `engine/intake/fixtures/l005/`. SHA-256 values are in the evidence index and match the manifest and PDF bytes.
- **Word layer.** Committed snapshots from Hive's own path: `buildDocumentPagesFromPdf` in `ensure-document-pages.ts` (`extractNativeWords`, same as the worker's `DocumentPagesStorage`). 17 pages, all `route: native`. Matching uses the same normalization as `normalize-quote-text.ts`.
- **Schema validation.** Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4` with a six-source context and no logical documents: `SUCCEEDED`, accepted 11/11 entities, 123/123 claims, 1/1 gap; 0 rejections, warnings or validation or integrity errors.
- With logical documents present in the context, every ref is rejected (`LOGICAL_DOCUMENT_REQUIRED`), as expected, because `logicalDocumentId` is null. Same behavior as L001–L004.
- No two claims share subject, construct and date.

## Source-document map

| Source ID | File | Pages | Document date |
| --- | --- | --- | --- |
| `l005-src-1` | `01_prior_iep.pdf` | 2 | 2025-04-08 |
| `l005-src-2` | `02_reevaluation_plan.pdf` | 1 | 2026-02-03 |
| `l005-src-3` | `03_psychoeducational_reevaluation.pdf` | 5 | 2026-03-04 |
| `l005-src-4` | `04_speech_language_review.pdf` | 4 | 2026-03-11 |
| `l005-src-5` | `05_reevaluation_eligibility_determination.pdf` | 2 | 2026-03-25 |
| `l005-src-6` | `06_reevaluation_iep.pdf` | 3 | 2026-04-02 |

## Inputs that were not supplied

- **Logical-document manifest (Engine 1).** Not supplied. `logicalDocumentId` is `null` on every ref; none were invented.
- **Committed document-pages layer.** Present at `engine/intake/fixtures/l005/document-pages/` in the same `stableJson` format `ensure-document-pages.ts` uses.
- **Unavailable identifiers.** `extractionId`, `spanStart` and `spanEnd` are null; location is page + quote, with word ranges in the index.
- **Customer context.** No user text, stated intent or Q&A, so `voiceProposal.subject`, `eventNoun` and `helperNoun` are null. `otherPartyNoun` is "the district", from "Prepared By: District" (src-2), as in L001 and L002.

## Case interpretation

A reevaluation cycle for SLD - Listening Comprehension. The case is built to test precision: almost every finding sits next to a deliberately similar sentence that must not be merged with it.

| What | 2025-04-08 IEP | 2026 reevaluation and IEP |
| --- | --- | --- |
| Eligibility | SLD - Listening Comprehension | Same, redetermined 2026-03-25; "Category Change: None" |
| Primary need | Following lengthy spoken directions | Same |
| Service | Specialized instruction, 3 × 30 min/week, special education setting, start 2025-04-08 | Same values, same stated start date |
| Direct speech-language | Not included | Not included; SL review does not recommend it |
| Accommodations | Extended time (1.5x) when directions are oral; explicitly **not** yet shorter steps + written directions | Extended time continued; **shorter steps + written directions listed**; checking understanding explicitly not listed |
| Goal | Begin task within 15 seconds after two-step classroom directions, 4/5 (no goal ID, no dates) | GOAL_DIRECTIONS_REEVAL: begin task without additional prompting given shortened oral directions with a written reference, 4/5; 2026-04-02 to 2027-04-01 |
| Team roles listed | Parent, general ed teacher, special ed teacher | Same plus district representative |

**Findings kept apart, each with its own condition (`task`) and source (`administration`):**
- Psych testing: asked for a direction to be repeated on **4 of 12 multistep tasks**; began without prompting when directions came one step at a time; paused when they came all at once; less consistent holding several pieces of verbal information; overall reasoning in the expected range.
- Teacher report (psych): completes classwork when written directions stay visible; cooperative in short, familiar routines.
- Parent report (psych): homework with several spoken directions often needs two or three reminders.
- SL review: intelligible speech; two-step directions accurate in a quiet one-to-one setting; accuracy decreased with three or more steps presented once; a familiar one-step practice item completed accurately; structured receptive and expressive language in the expected range.
- Teacher report (SL): greatest difficulty in whole-group instruction with lengthy directions and competing noise.

**Distractors deliberately not captured as findings:** the single-word repeat after a cough, the pencil request, and the visual-puzzles closing observation. The psych report says the last one "is not used as Gold evidence"; the other two are explicitly "not the multistep-direction count" or "not the same observation". Any pipeline claim built on them is wrong.

## Judgment calls to confirm

1. **One gap: progress on the 2025 goal.** The reevaluation plan lists "Current IEP and progress information" as available to the team, and the 2025 IEP promises reporting at least annually. No progress report or other progress record for the 2025 goal is supplied. Same pattern as L002's gap: a document references material that is not in the record.
2. **The 2025 goal is an entity even though it has no heading, ID or dates.** The sentence "Given two-step classroom directions, Jordan will begin the requested task within 15 seconds on four of five opportunities" sits at the end of present levels, but it is phrased as a goal, and the IEP's progress section refers to "the annual goal". I treated it as that goal and gave it the IEP period. The alternative is an `observed` present-levels statement with no goal entity.
3. **"Carries forward" is not treated as a conflict.** src-1 says the 2025 IEP "does not yet include" breaking lengthy oral directions into shorter steps with written directions; src-6 lists it and says the IEP "carries forward" shorter oral directions and written directions. The most likely reading is that it carries forward the evaluation recommendations (the next sentence is about which recommendations were adopted). Both statements are captured as written. There is no `accommodation_newly_added` claim, because no document says "added". If you read "carries forward" as a claim about the prior IEP, this becomes a `status_disagreement` conflict.
4. **Grade 5 in both IEPs, a year apart.** Every document says Grade 5, from 2025-04-08 to 2026-04-02. With a 2015-10-21 birth date this is unusual but possible (for example, retention), and no document addresses it. It is one claim with all refs; it is not a conflict between documents, and it was not "corrected".
5. **Service start date 2025-04-08 in the 2026 IEP.** The 2026 IEP's service table repeats the 2025 start date although its own period starts 2026-04-02. It is recorded as stated (`observed`), with the IEP period as the 2026 service's effective period. No inference that the service was interrupted or restarted.
6. **Two eligibility decisions, not one.** 2025-04-08 (recorded in the 2025 IEP) and 2026-03-25 (reevaluation) are separate `decided` claims with the same value, as in L002.
7. **Primary need wording.** src-5 p1 says the need "remains following spoken directions"; its label and both IEPs say "Following lengthy spoken directions". One value (the label wording) plus a separate `primary_need_unchanged` claim on src-5; the shorter phrase is not treated as a different need.
8. **Recommendations.** Psych (shorter steps; checking understanding) and SL (shorten directions with a written reference) are `observed` `evaluation_recommendation` claims on their reports, each explicitly "not current IEP services". The 2026 IEP's adoption of shorter steps + written directions, and its explicit non-adoption of checking understanding, are claims on the IEP.
9. **Teacher name.** "Ms. Green" appears only as written in src-3 (as a source of information); no identity entity was created for her.

## Unreadable or uncertain content

None. All 17 pages are native text. One sentence splits across src-3 pages 4–5 ("Near the end of the session, Jordan completed the visual puzzles with / steady effort…"); it is the excluded closing observation and is not quoted.

## Deliberately not treated as conflicts

- Two-step directions accurate in a quiet one-to-one setting vs teacher-reported difficulty in noisy whole-group instruction. The SL review says the teacher report "does not contradict" the one-to-one result.
- Overall reasoning in the expected range vs less consistent performance holding verbal information. The psych report says "The two observations answer different questions."
- Structured language in the expected range vs a classroom direction-following need. The SL review says the expected-range result is not a global statement.
- No direct speech-language service recommended vs a communication-related educational need. The SL review says the first is not a finding of the second.
- Teacher report (visible written directions) vs parent report (homework with spoken directions): different settings.
- The 2025 vs 2026 goal: different goals, not a change in one goal's values.
- "Carries forward" (judgment call 3), Grade 5 (judgment call 4), service start date (judgment call 5).

## Deliberately not treated as gaps

- **Functional behavior assessment.** Unchecked in the plan.
- **A district representative on the 2025 IEP team.** Not listed; nothing in the record says one was expected.
- **A least-restrictive-environment statement in the 2025 IEP.** Not present; no document refers to it.
- **Progress reports under the 2026 IEP.** Reporting is at least annually from 2026-04-02; none is due within the record.
- **A goal ID or dates for the 2025 goal.** Absent, and nothing refers to them.
- **Team signatures.** "[Synthetic signature omitted]"; synthetic record.

## Tripwires for the grader

A pipeline output that does any of these is wrong on this case:

1. Uses the cough-related word repeat, the pencil request or the visual-puzzles observation as direction-following evidence.
2. States that Jordan "cannot follow directions", or turns two-step one-to-one accuracy into mastery across settings.
3. Says the 2025 IEP included shorter steps with written directions.
4. Says checking understanding before independent work is an IEP accommodation.
5. Treats any evaluation recommendation as an IEP decision or current service.
6. Reports ADHD, a working-memory disorder, an executive-function disorder or a language impairment as identified.
7. Reads "no direct speech-language services recommended" as "no communication need".
8. Reports the parent's two or three reminders as a school or evaluator observation.
9. Reports a conflict between quiet one-to-one accuracy and whole-group difficulty, or between expected-range reasoning or language and the direction-following need.
10. Says eligibility category or primary need changed.
11. Calls SLD a medical diagnosis.

## Questions a reviewer could expect the pipeline to raise

- The psychologist recommended checking understanding before independent work, and the new IEP says it is not listed. Worth asking why, and whether it could be added.
- Is there a progress report on the 2025 goal? The reevaluation plan refers to progress information. (gap_001)
- The new goal is measured with shortened oral directions and a written reference. How will progress with lengthy spoken directions in whole-group instruction be tracked?
