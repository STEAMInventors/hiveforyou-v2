Status: verified by Aryya Bhattacharyya.

# iep-e-1 golden reference: review notes

Built 2026-10-07 against `refactor/engine-boundary` @ `888e412`, with the same method and output format as the L001 golden reference. The source is one 15-page PDF, `iep-e-1.pdf` (sha256 `30f7205c…5d748b27`). It is a scanned, redacted Washington State IEP packet dated 01/17/2012: a meeting invitation (p1), a contact attempt report (p2), the IEP (p3–14) and a prior written notice (p15).

The case is not yet in the repo. `iep-e-1` is a working case ID taken from the file name. The T1.2 slot (L002–L006) has not been assigned.

## Files

| File | What it is |
| --- | --- |
| `iep-e-1-golden.v4.json` | The golden, in `canonical-study-proposal/4` |
| `iep-e-1-golden.evidence-index.json` | Every evidence ref with page, quote and word range (`startSeq`–`endSeq`). Also gives the occurrence count, whether the layer text matches the printed page (`layerMatchesPage`, `pageText`), and whether the value depends on a checkbox or table mark (`valueFromMark`) |
| `build_iep-e-1_golden.py` | Independent builder and checker. Reads Hive's document-pages JSON, finds every quote as consecutive words on its page using Hive's quote normalization, aborts on any miss, counts duplicate occurrences, then writes both JSON files |
| `iep-e-1-golden.REVIEW.md` | This file |

## Counts and checks

| Item | Count |
| --- | --- |
| Entities | 32 (student, meeting, parent, 5 team roles, 10 annual goals, 5 services, 9 accommodations) |
| Claims | 185 (planned 95, observed 58, decided 31, required 1) |
| Conflicts | 0 |
| Missing-information items | 4, all `field_present_but_empty` |
| Evidence refs | 249 |
| Quotes found as consecutive words on the cited page | 249 / 249 |
| Quotes not found | 0 |
| Refs whose layer text differs from the printed page | 61 (54 claims, 5 entities, 1 gap). See "Word layer differs from the page" |
| Claims whose value depends on a checkbox or table mark | 23 |

Checks run:

- **Builder:** every quote was located, and the build aborts on any miss.
- **Hive's own matcher:** `findConsecutiveWordQuote` (`engine/core/src/document/find-consecutive-word-quote.ts`) finds all 249 quotes. For 248 of them its first match equals the indexed word range. The exception is the deliberate second occurrence noted below.
- **Repo `/4` contract validator** (`@hiveforyou/shared/case-intelligence/4`): ok.
- **Repo `validateCanonicalStudyProposalV4`** (`engine/core/src/study/validate-proposal-v4.ts`): SUCCEEDED. It accepted 32 entities, 185 claims and 4 gaps, and rejected nothing. This ran in a context with no logical documents.
- **Word-layer parity:** the layer was produced with Hive's own `buildDocumentPagesFromPdf` → `extractNativeWords`. To check that path, I regenerated L001 `08_initial_iep.json` with it. Every word matched the committed snapshot. Only `fontName` labels differ (`g_d0_*` vs `g_d7_*`), and they are not used for matching. In every page, `seq` equals the word's array index.

Duplicate quote occurrences:

| Ref | Page | Quote | Occurrences | Used |
| --- | --- | --- | --- | --- |
| `ev_c_goal_reading_comprehension_target_date_1` | 8 | "By 01/11/2013, when given 7.0 grade level" | 2 | **2nd**. The first opens the word-problems goal. No longer quote is clean, because the next layer token is `text.-` while the page shows "text," then a redaction. Hive's matcher would resolve this quote to the first occurrence. |
| `ev_mi_progress_report_method_blank_1/2/3` | 8 / 9 / 10 | "How will progress toward this goal be reported? (check all that apply)" | 3 / 4 / 3 | 1st on each page. The label repeats once per goal, and the gap covers all ten goals. |

## Inputs that were not supplied

- **Committed document-pages word layer.** None exists. This case is not in `engine/intake/fixtures/`. I generated the layer with Hive's own extractor, as described above. Its startSeq/endSeq are what the worker would store for these bytes, but the layer itself is not committed. To make the word ranges official, commit the PDF under `engine/intake/fixtures/<case>/` and its snapshot under `document-pages/`, then rerun the builder against the committed file. The builder checks the PDF's sha256.
- **Logical-document manifest / Engine 1 inventory.** None. There is one source ID, `iep-e-1-src-1`, and `logicalDocumentId` is `null` everywhere. The PDF holds four logical documents (invitation, contact report, IEP, prior written notice), but I did not invent their IDs or page bounds. As in L001, the validator will reject every ref (`LOGICAL_DOCUMENT_REQUIRED`) once a manifest exists, until the real IDs are filled in.
- **Identifiers.** The student name, IDs, date of birth, school, address, phone numbers, all participant names, the meeting location and the contact person are redacted. `subjectName` is null.
- **Unreadable pages.** None. Page 6 is a continuation page with only the header and "Meeting Date". It holds no content and is not a gap.
- `spanStart`, `spanEnd` and `extractionId` are null. Location is page plus quote.

## Word layer differs from the page

This is the main finding for this case. The PDF is a scan with an OCR text layer, and Hive's `extractNativeWords` takes that layer as is. Most of the text is clean. In some places, though, the layer has different characters from the page: `Titne` for "Time", `Mittutes` for "Minutes", `Reaular` for "Regular", and the disability field comes out as `E =m ......_ ot …`.

Hive's provenance rule says the quote must be "the exact source text … including … spelling errors", and code checks the quote against this layer. So:

- **Every quote is the layer's exact text at the right place.** That is the only text the verifier will accept.
- **Where the layer differs from the page, the index sets `layerMatchesPage: false`** and records `pageText`, my reading of the printed page. The claim's **value** comes from the page, never from the OCR text.
- **I kept quotes on the page's clean wording wherever possible.** The 61 refs below are the ones where no clean span supports the fact.

| Page | Claims | Layer text → page text |
| --- | --- | --- |
| 1 | `c_meeting_purpose` | `X Review CwTent IEP` → X Review Current IEP |
| 2 | `c_contact_letter` | `Leth. •1· 01/12/2012 Can Attend` → Letter 01/12/2012 01/12/2012 Can Attend. The layer is missing one of the two dates. |
| 3 | `c_iep_date` | `IEP Date: ..... 0 '""' 1 .._ /1 …` → IEP Date: 01/17/2012 |
| 3 | `c_age` | `Age* :...1§.` → Age* 15 |
| 3 | `c_disability` | `Disability (if identified): ..... E =m …` → Emotional Behavioral Disability |
| 3 | `c_primary_language` | `… E =n .... g.,. l= is …` → English |
| 3 | `c_surrogate_parent` | `Swrngate parent: 0 Yes lx ]No` → Surrogate parent: No |
| 3 | `c_plan_period` (start ref) | `Plan staitdate 01 /17/2012` → Plan start date 01/17/2012 |
| 3 | `c_primary_staff_contact` | `Primaiy Staff Contact: - …` → Primary Staff Contact |
| 5 | `c_plep_group_participation` | `3/1 O opportunities` (letter O) → 3/10 opportunities |
| 8 | three goal targets (math calculation, word problems, comprehension) | `7.0 gra I`, `7.0 grade lev`, `7.0 grade le~easured` → 7.0 grade level |
| 12 | `c_assess_waas`, `c_assess_local` | `Po1·tf0Iio`, `Locallv-Determined` |
| 13 | all 35 service claims and the 5 service entities | `Mittutes`/`Mitmtes` → Minutes; `Readittg`, `Writittg`; `Tchr!Paraeducator` → Tchr/Paraeducator; `Behaviora 1` → Behavioral |
| 14 | three LRE claims, `c_transportation` | `Reaular` → Regular; `Transpo1 ·tation:` → Transportation: |
| 7 | gap `mi_transition_services_blank` | `Transition Senices … Starr/` → Transition Services … Staff / |

What this means for the plan:

- **Every service minute value, the disability category, age and primary language can be accepted only if the model copies OCR text.** The model reads the PDF visually, so in practice it will quote "40 Minutes", and the verifier will reject that.
- **These 54 claims measure the word layer as much as the model.**
- **Token splits are not counted as differences.** These are places where the characters are right but the spaces are not: `01 /12/201 2`, `8 :30 AM`, `ofProcedural Saf eguards f or`, `6.0grade`. Even so, a model that quotes "01/12/2012" will not match `01 /12/201 2`, because `normalizeQuoteForMatch` only collapses whitespace and never joins tokens. Many otherwise clean dates on this case carry such splits.

## Judgment calls to confirm

1. **Keep or split the 54 layer-limited claims.** I kept them because they are clearly printed facts. One alternative is to tag them in the T1.2 `GoldenCase` so the grader reports them separately, for example as `layerLimited`. The other is to fix the word layer (re-OCR) before this case is used. Dropping them would hide the problem.
2. **Planned meeting vs held meeting are two claims.** The invitation and contact report give the scheduled date and time (`planned`). The cover page and the section headers give the date the meeting was held (`observed`), with seven restatements on one claim.
3. **"Date Sent to Participants: 01/12/2012" (invitation) and "Date parent notified of Plan meeting 01/12/2012" (cover page) are kept as separate facts.** They are probably the same letter, but the record does not say so.
4. **The procedural-safeguards notice is two claims:** one with the invitation (p1, "to parents") and one with the prior written notice (p15, "to parents/guardians"). These are separate provisions at separate times.
5. **Gap: student-notified date (p3).** The field is labeled "(if transition will be discussed)" and is blank. The IEP has a full Secondary Transition page. However, the invitation did not tick "Discuss Transition Services". I flagged it. Confirm that it should count.
6. **Gap: how progress is reported (p8–10).** For all ten goals, the only option, Written Progress Report, is unmarked, while "Quarterly" is marked. I made this one gap, not ten.
7. **Gap: transition services (p7).** The Transition Services and Staff / Agency Responsible cells are empty under both post-secondary goals. The label quotes are layer-limited.
8. **Gap: "The action will be initiated on:" (p15)** is blank.
9. **Modality choices.** "IEP team recommends …" is `decided`: dropping the math fluency skill (p5), and the LRE explanation (p14). "The Structured Learning team develops interventions" (p4) is `planned`. Post-secondary interests (p7) are `planned`. Goal baselines are `observed`; targets and target dates are `planned`. Disability category, ESY, PE, placement and the "None at this time" considerations are `decided`. Re-evaluation is the only `required` fact.
10. **Mark-dependent values (23 claims)** read checkboxes or "X" columns. These include ESY No, PE Yes, transportation Regular, surrogate parent No, neighborhood school No, the HSPE participation and accommodation columns, and the LRE selected and rejected columns. The marks are graphics, so the quote anchors only the label or row.
11. **Participants.** The five titles in the p3 participant list each get an entity and a "participated" claim. The parent, psychologist and special education teacher share one quote, "Parent Psychologist Special Education Teacher", because the layer runs the title column together. The primary staff contact ("SC Structured Learning Teacher") is a separate entity. I did not assume it is the same person as the special education teacher.
12. **Value wording kept shorter than the page where a redaction overlaps.** `c_strength_creative` = "is creative". "humor" is clipped by a redaction box. `c_postsecondary_education` = "interested in going to college to complete a degree"; the end of "law enforcement" on that line is clipped.
13. **`otherPartyNoun` = "the school district"** comes from the p15 notice. That text is boilerplate; "the district" is also defensible.

## Unreadable or uncertain content

| Page | Location / field | What could not be read reliably | Effect |
| --- | --- | --- | --- |
| 4 | Team considerations, strengths and concerns | "she wants" and "therapist" are partly covered by redaction boxes, and the speaker is redacted | Excluded the claim (who wants home–school–therapist communication) |
| 4 | Same paragraph | "humor" clipped | Claim limited to "is creative" |
| 7 | Education/Training goal | Start of "enforcement" clipped (layer reads `cement.`) | Value stops at "complete a degree" |
| 10 | Writing goal (paragraph) target | "90%" sits under the bottom edge of a redaction box; only the lower half of the digits shows | **Target excluded.** Baseline (50%) and target date kept |
| 8 | Three goal targets | "grade level" partly clipped after "7.0" | Kept. The percentages are clear, and "7.0 grade level" matches the parallel wording in each sentence. Confirm |
| 1 | Invitee list | Three of five invitee lines (Family Therapist, General Education Teacher, Parent) are missing from the word layer; they are visible on the page | No invitee claims. Participation is taken from p3 instead |
| 2 | Notification Area | Layer is garbage (`""'P ..... l =a""'n_`); the page shows "Plan" | Not claimed (form metadata) |
| 5 | Several PLEP sentences | Garbled in the layer next to redactions: "asks for help", "1:1 reading … alternative location", "most often refuses to complete", "very concerned about making mistakes", "always works hard" | Not claimed. No clean span supports the value |
| 8–10 | "Supports the student's post secondary goals: Yes" (×10) and "Quarterly" (×10) | Labels garbled in the layer (`secondat·y`, `Qua1t erly`); on p10 the mark glyph is `~` | Not claimed |
| 12 | Meeting Date header | Layer garbled | p12 ref omitted from the meeting-date claim |
| 15 | Checked item "IEP" in the PWN item list | The layer has no glyph for the mark | Not claimed. The proposed action is taken from the description line |

## Deliberately not treated as conflicts

- **PLEP vs goal baselines.** These agree in every case: 8/10 vs 80%, 5/10 vs 50%, 60 WCPM, 75%, 5/10 vs 50% compliance, 9/10 vs 90%, 3/10 vs 30% (twice), 80% and 50%. Different units are not conflicts.
- **Math calculation goal "from 80% at the 6.0 grade level to 80% at the 7.0 grade level".** The two values match, but at different grade levels. This is not a disagreement.
- **Reading fluency goal uses 6.0 grade level text, comprehension uses 7.0.** These are different goals.
- **Service minutes vs totals.** The services add up to 180 min/day; 900 min/week special education setting out of 1000 is 10% general education, and 0–39% in regular class was selected. All consistent. I did not record the derived sums as claims.
- **Half-day schedule (PWN) vs 1000 minutes/week.** These are compatible. No claim was derived from them.
- **The PWN marks "proposing" / "initiate", while the description reads "Review of the annual Individualized Education Plan".** This is one document's form choices, not two claims that disagree.
- **Phone contact 01/11/2012 is before the letter and invitation of 01/12/2012.** This is a sequence of contacts.
- **"will be taking the HSPE exam his sophomore year" (p4) vs HSPE Level 2 participation marked Yes (p12).** These are compatible.
- **HSPE Reading Level 2 lists the "For Writing" dictionary accommodation.** It is recorded as written. It may look odd, but it is not a conflict.
- **Plan end 01/11/2013 is not the anniversary of the plan start (01/17/2012).** It falls on the anniversary of the most recent evaluation (01/11/2012). No conflict.

## Deliberately not treated as gaps

- **Parent interpreter needed (p3).** Neither Yes nor No is marked. I did not flag it: primary language at home is English, and an unmarked optional field is not a gap by itself. Confirm.
- **"Supports for School Personnel" (p11)** and both **"Comments"** fields (p3, p7) are blank. These are optional fields.
- **"If the parent did not attend …" (p3)** is blank. The parent is listed as a participant.
- **No evaluation report is supplied** even though the most recent evaluation is dated 01/11/2012. Nothing in the record says it would be supplied.
- **No progress reports** exist. Reporting is future to the plan.
- **Page 6** is an empty continuation page.
- **Agency linkage** is marked "Not appropriate at this time". That is a stated decision, not a blank.
- **"Discuss Transition Services" is unmarked on the invitation.** This is a choice on a form, not an empty field.

## Redaction handling

These fields were redacted and not reconstructed:

- student name, Student ID, WA SSID, second student ID, date of birth (header on every page)
- the school/district block (top right of every page)
- invitation addressee, meeting location, all invitee names, and the contact person's name and email (p1)
- location and both contact names (p2)
- student name, parent/guardian name, home address, both phone numbers, attending school, primary staff contact name and phone, and all participant names (p3)
- the student's name throughout the narrative pages (p4–p10, p15)
- PWN addressee, student name, and the help contact name and phone (p15)

No missing-information item was created for any redaction.

## Judgment calls Aryya should confirm

1. **Layer-limited facts.** Should the 54 claims that only verify against OCR text stay in the golden, be tagged so the grader scores them separately, or wait until the word layer is fixed? This covers all service minutes and providers, plus disability, age, language and the LRE rows.
2. **Writing goal target excluded.** It sits partly under a redaction box, so I treated "90%" as unreadable.
3. **The four gaps.** Student-notified date, progress-report method, transition services, and PWN initiation date. In particular, should the student-notified date count, given that the invitation did not tick transition?
4. **Parent interpreter not flagged** as a gap.
5. **Separate claims for related facts:** scheduled vs held meeting, invitation sent vs parent notified, and the two safeguards notices.
6. **Modality of team recommendations** (`decided`) and post-secondary interests (`planned`).
7. **Case ID and fixture slot** (`iep-e-1` → L00N, tune or holdout).
