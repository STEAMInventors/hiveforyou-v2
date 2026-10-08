Status: verified by Aryya Bhattacharyya.

# L002 golden reference: review notes

Built 2026-10-07 against `refactor/engine-boundary` @ `888e412`, with the same method and layout as the L001 reference. Domain: `iep`. No `verifiedBy` yet.

## Files

| File | What it is |
| --- | --- |
| `l002-golden.v4.json` | The golden, in `canonical-study-proposal/4`, `domainId: "iep"` |
| `l002-golden.evidence-index.json` | Every evidence ref with source, page, quote, verified word range (`startSeq`–`endSeq`) and `occurrencesOnPage`, plus the SHA-256 checks per source. Seeds T1.2 `GoldenFact.wordRange` |
| `l002-golden.REVIEW.md` | These notes |
| `build_l002_golden.py` | Reference / provenance builder. Reads the committed word layer, checks hashes, aborts if any quote is not consecutive words on its cited page, writes the two JSON files. Not runtime or grader code |

Rebuild: `python3 -I build_l002_golden.py <repo root> <out dir> [<uploaded-pdf dir>]`.

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 14 (student, school, district, 9 source records, 2 annual goals) |
| Claims | 173 (115 `observed`, 29 `decided`, 29 `planned`) |
| Conflicts | 0 |
| Missing-information items | 1 |
| Evidence refs | 351 (26 on entities, 323 on claims, 2 on the voice proposal) |
| Quotes verified as consecutive words on the cited page | 351 |
| Quotes not verified | 0 |
| Quotes occurring more than once on their page | 0 (repeated sentences were quoted with enough context to be unique) |

- **Source identity.** The nine uploaded PDFs are byte-identical to `engine/intake/fixtures/caleb9/*.pdf`; all SHA-256 values match `caleb9/manifest.json` and each snapshot's `sourcePdfSha256`.
- **Word layer.** `engine/intake/fixtures/caleb9/document-pages/*.json`, 18 pages, all `route: native`, no illegible regions. Matching uses the same normalization as `normalize-quote-text.ts`.
- **Schema validation.** Repo `/4` contract validator: ok. Repo `validateCanonicalStudyProposalV4` with a nine-source context and no logical documents: `SUCCEEDED`, accepted 14/14 entities, 173/173 claims, 1/1 gap; 0 rejections, warnings or provenance, integrity or validation errors.
- With logical documents present in the context, every ref is rejected (`LOGICAL_DOCUMENT_REQUIRED`), as expected, because `logicalDocumentId` is null. Same behavior as L001.

## Source-document map

| Source ID | File | Pages | Production `sourceDocumentId` (manifest, for cross-reference only) |
| --- | --- | --- | --- |
| `l002-src-1` | `01_prior_eligibility_determination.pdf` | 2 | `d37f2730-ae42-4ae4-93e3-dfa8f11f5591` |
| `l002-src-2` | `02_prior_iep.pdf` | 2 | `4914a2eb-fe7c-41d1-9988-e268927255e8` |
| `l002-src-3` | `03_annual_progress_report.pdf` | 1 | `0ef52e40-1613-4de7-8bed-a6d6ca4fd81e` |
| `l002-src-4` | `04_reevaluation_plan.pdf` | 2 | `37bdd53b-bc1f-4571-855e-5606e98145cd` |
| `l002-src-5` | `05_psychoeducational_reevaluation.pdf` | 2 | `97d24116-ad8b-4b2c-b1c0-f51da4abb974` |
| `l002-src-6` | `06_academic_reevaluation.pdf` | 2 | `1dcca507-27bd-4623-a984-c3b64a5cb5c9` |
| `l002-src-7` | `07_speech_language_review.pdf` | 1 | `0d10833b-aa10-4fed-bb1e-8676ef943c8a` |
| `l002-src-8` | `08_reevaluation_eligibility_determination.pdf` | 2 | `434a8ce4-5dc0-4d7a-8881-46f3fbce57e0` |
| `l002-src-9` | `09_reevaluation_iep.pdf` | 3 | `b28484c7-29b1-43cf-a484-52f961cd5f23` |

The golden uses the `l002-src-N` IDs as instructed. The production IDs come from the existing `caleb9` manifest (study run `3a739f34-…`) and are listed only so the two can be joined.

## Inputs that were not supplied

- **Logical-document manifest (Engine 1).** Not supplied. `logicalDocumentId` is `null` on every ref; none were invented. They must be filled in before this golden runs inside a live study context.
- **Committed document-pages layer.** Not supplied with the prompt, but found in the repo: the uploads are byte-identical to the `caleb9` corpus, whose word layer is committed. Word ranges are therefore verified, not pending.
- **Fixture naming.** The plan expects L002 under `engine/intake/fixtures/l002/`. In the repo this corpus is `caleb9` (each page footer says "L002"). The builder reads it from `caleb9`; if it is moved or copied to `l002`, change `CORPUS_REL` in the builder.
- **Unavailable identifiers.** No extraction IDs (`extractionId: null`) and no character spans (`spanStart`/`spanEnd: null`); location is page + quote, with word ranges in the index.
- **Unreadable content.** None (see below).
- **Customer context.** No user text, stated intent or Q&A, so `voiceProposal.subject`, `eventNoun` and `helperNoun` are null.

## Longitudinal interpretation

The case runs from October 2023 to October 2026. Each change below is kept as separate dated claims, never as a conflict and never with the later fact replacing the earlier one.

| What changed | Earlier (source, date) | Later (source, date) |
| --- | --- | --- |
| Primary educational need | Reading Fluency (src-1 2023-10-12; restated src-2) | Reading Comprehension (src-8 2026-10-14; restated src-9) |
| Eligibility category | SLD - Reading (2023-10-12) | SLD - Reading, "Category Change: None" (2026-10-14). Two decisions, same value |
| Specially designed instruction | Targets reading fluency (2023) | Targets reading comprehension (2026) |
| Oral reading fluency | 62 WCPM present-levels baseline (src-2) → 91 WCPM progress probe (src-3, 2024-10-15) | 104 WCPM academic reevaluation (src-6, 2026-09-29) |
| Annual goal | `GOAL_ORF_FLUENCY`: 95 WCPM, target not yet met on 2024-10-15 | `GOAL_READING_COMPREHENSION`: 60% → 80% accuracy; "does not include an oral-reading-fluency annual goal" |
| Progress reporting | At least annually | Quarterly |
| Accommodations | Extended time (1.5x) | Extended time (1.5x), continued; text-to-speech added |
| Service | Specialized reading instruction, 5 sessions per week, 45 minutes, special education setting | Same service: "5x/week" / "five times per week", 45 minutes, same setting |
| Grade | 2 (2023) → 3 (2024-10-15) | 5 (2026) |

Document roles are kept apart. Evaluation recommendations (src-5, src-6, src-7) are separate `evaluation_recommendation` claims on the evaluation report, and each report's own statement that it does not decide eligibility, services or goals is captured. The reevaluation plan's items are `planned`; its "No new evaluation results are reported here" is captured. The progress report's statement that it does not revise present levels or change eligibility, services or accommodations is captured.

The reading comprehension standard score of 78 stays a standard score (unit `standard score`), with a separate claim that the document says it "is not a percentage score". The 60% comprehension-question accuracy is a classroom instructional measure, kept apart from the standard score.

## Judgment calls to confirm

1. **One gap: parent input.** The plan (src-4 p1) checks "[X] Parent input" under "Information to Be Gathered". No later document records parent input or lists it as a source reviewed: psych sources are the plan, records, teacher information and observation; the reevaluation determination lists the three evaluations and records. Same pattern as L001's one gap. Every other plan item is accounted for (see "Deliberately not treated as gaps").
2. **The IEP in effect from 2024-10-24 to 2026-10-20 is not treated as a gap.** The supplied 2023 IEP ends 2024-10-23. The plan (2026-09-08) says Caleb "currently receives special education services under an IEP" and checks "[X] Current IEP and progress information"; the psych report says he "currently has an IEP addressing reading"; the 2026 IEP says extended time "continues from the prior IEP". None of these supplied documents covers 2024-10-24 to 2026-10-20. I left it out because no document says it will be gathered or produced, and rule 2 forbids inferring missing records. For a parent or advocate it is the most consequential absence in the file. If you want it, it is a `not_found_in_supplied_documents` gap on `ent_reeval_plan`.
3. **Zero conflicts.** Every difference is a change over time or between document roles. L002 should be a tripwire for false conflicts on changed primary need, changed goal and changed ORF values.
4. **Time anchors.** Facts that a document reports without its own measurement date carry that document's own date as `occurredOn` (the earliest citing document when restated). This gives grade 2 / 3 / 5, the two eligibility decisions and the three ORF values distinct anchors, so they cannot read as simultaneous. The 62 WCPM baseline is anchored to the IEP date (2023-10-24), not a test date, because none is stated. IEP services and accommodations carry the stated IEP period; goal claims carry the stated goal start and target dates. L001 left its single grade unanchored; here anchors are needed because values change.
5. **Modality.** Eligibility, category, primary need, SDI requirement, services, accommodations and the "no ORF goal" statement are `decided`. Goal targets, conditions, mastery criteria, dates, measurement and reporting are `planned`. Evaluation recommendations are `observed` claims whose construct is `evaluation_recommendation` (the report states the recommendation; nothing adopts it). `planned` for recommendations would be the main alternative.
6. **Deduplication across documents.** One claim, many refs, where later documents restate the same fact: the 104 WCPM / 97% / standard score 78 results (src-6, src-8, src-9); cognitive ability in the average range (src-5, src-8); no separate speech-language need (src-7, src-8); determination dates restated in the IEPs; category and primary need restated in each IEP. 97% and "97 percent" are one value (equivalent forms).
7. **Not deduplicated.** The 2023 and 2026 eligibility decisions, and the 2023 and 2026 "global cognitive limitation is not the primary explanation" findings, are separate claims because they are separate determinations at different times with different administrations.
8. **Units are copied, not normalized.** 2023 frequency `sessions/week` ("5 sessions per week"); 2026 frequency `times/week` ("5x/week", "five times per week"). Same number, different source wording. Session length unit is `minutes`.
9. **`otherPartyNoun` = "the district"**, from "Prepared By: District" (src-4), same choice as L001.

## Unreadable or uncertain content

None. All 18 pages are native text with no illegible regions, redactions or images carrying content. No value was reconstructed.

## Deliberately not treated as conflicts

- Primary educational need: Reading Fluency (2023) vs Reading Comprehension (2026).
- Oral reading fluency: 62 (2023 baseline), 91 (2024-10-15), 104 WCPM (2026-09-29).
- 91 WCPM vs the 95 WCPM target: progress toward a goal, recorded as "not yet met".
- Annual goal in fluency (2023) vs comprehension (2026), and the 2026 IEP having no ORF goal.
- Progress reporting at least annually (2023) vs quarterly (2026).
- Accommodations: text-to-speech added in 2026; extended time continued.
- Frequency wording "5 sessions per week" vs "5x/week": same number, different documents and periods.
- Grade 2, 3, 5 across three school years.
- Evaluation recommendations (comprehension instruction, literal and inferential questions) vs the adopted 2026 IEP. These are not linked as adopted, even where the IEP goal mentions literal and inferential questions.
- Eligibility category in 2023 and 2026: identical values, two decisions.

## Deliberately not treated as gaps

- **Plan items with a later record:** current reading achievement, reading comprehension and oral reading fluency (src-6); cognitive / processing context (src-5); speech-language review (src-7); review of existing data and records (src-5 sources, src-8 evidence reviewed); teacher input (src-5 "Teacher information regarding classroom reading tasks"); academic assessment of reading (src-6); psychoeducational information (src-5).
- **The 2024-10-24 to 2026-10-20 IEP** (judgment call 2).
- **Quarterly progress reports** under the 2026 IEP: future reports, not yet due on the IEP date.
- **Progress reports other than 2024-10-15** under the 2023 IEP: it promised reporting "at least annually", and one annual report is supplied.
- **Unchecked boxes** ("[ ] Later reevaluation results" in src-1; "[ ] Completed reevaluation scores" in src-4; "[ ] Not eligible…"; "[ ] Student no longer meets criteria…"). These are recorded choices, not empty fields. The src-4 box supports the claim that the plan reports no results.
- **Measurement date of the 62 WCPM and 60% baselines:** neither IEP states a test date, and practice-based expectations are excluded by rule 11.

## Redaction / synthetic-omission handling

- Both IEPs show `[Synthetic signature omitted]` for Parent/Guardian, General Education Teacher, Special Education Teacher and District Representative, and say "No personal names, telephone numbers, or addresses are recorded in this synthetic record." These are captured only as a team-roles claim per IEP. No gap was created.
- Evaluators are named by role only ("School psychologist", "Academic evaluator", "Speech-language pathologist", "Special education teacher"). Those roles are claims; no personal names were added.
- No redactions, blacked-out text or obscured regions exist in this corpus.
