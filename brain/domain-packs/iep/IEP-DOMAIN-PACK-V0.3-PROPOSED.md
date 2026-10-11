# IEP Domain Pack v0.3 — Review specification

**Status:** PROPOSED, review-only. No implementation authorized.
**Files:** `iep-pack.v0.3.proposed.json` (the pack), `validate-pack.ts` (structural validator), `review-check.json` (validator output).
**Supersedes:** v0.2-proposed. **Compatibility:** not a drop-in for `engine/domain-pack/src/types.ts`; migration needs approval.

## Objective

A generic Hive Core reads one document at a time with a prompt and output schema generated from this pack, verifies each record against its page, and combines records across documents by content keys. The pack is data only. Model proposes; pack defines; code validates and combines; professional decides. No chip, no claim.

## What changed from v0.2

| # | v0.2 | v0.3 | Why |
|---|---|---|---|
| 1 | Keys included `plan` / `document` | Keys are content fields; the document's ordering date is the version axis | Otherwise the same service in two plans never matches, so change, series and conflict can't fire |
| 2 | Key parts were labels (`goal`, `service_line`, `measure`) | Each key lists real fields, e.g. service = `category` + `service_type` | Neither the model nor code could fill a label |
| 3 | 92 single-field fact types | 25 record types, 131 fields; one row or goal = one record with one quote | Keeps a row's minutes, location and dates together when there are several services |
| 4 | Measure keyed differently in evaluations, goals, progress | One `measure` construct (task + score type, plus instrument and administration when both present); one `measurement` record type for every score | Baseline-vs-evaluation checks and series need one key |
| 5 | Evaluations all `evaluator`; no IEE or parent letters | Author roles map to parties (school, independent, parent); added `iep.evaluation.independent`, `parent.correspondence` | Conflict = different parties; change = same party later |
| 6 | No ordering date | Each document type declares `orderingDate` | Compose and change need an order |
| 7 | No transition, assessment participation, service category | Added transition, assessment participation, transfer of rights, ESY, short-term objectives; service category in the key | Required federal contents |
| 8 | Quoted and derived only | Added `classified` (chosen from an enum, shown as a correctable label) | Author role, subtype, score type, status codes, categories |
| 9 | Requirements empty | 11 federal content rules from 34 CFR 300.320 and 300.503(b), cited, pending legal review; uploads still not required | Without them "missing" can't work |
| 10 | 3 draft checks, one duplicating the engine default | 8 declarative checks; engine defaults not repeated | Insight output |
| 11 | Reading notes global only; 4 explainers; 7 terms | Notes for 9 document types; 12 explainers per record type; 25 abbreviations, synonyms, units, 9 definitions of easily confused terms | Completeness |

Kept from v0.2: modality (observed, planned, decided), checklist is not requirement, four missing states, derivation conditions, unresolved identity never merges, lineage links, no callbacks, status flags.

## Identity model

- **Key fields:** must match (after normalization) for two records to be the same thing.
- **Key fields if present:** compared only when both records have them; a mismatch makes them different.
- **Disambiguators:** split two records that share a key inside one document (e.g. individual vs group speech). Never used across documents.
- **Version axis:** the document's `orderingDate`. Never part of a key.
- **Partial match:** `possiblySame`, shown as a question, never merged.
- **Change vs conflict:** same key and party with a later date = change; same key, different parties = conflict.

| Record | Key | If present | Disambiguators |
|---|---|---|---|
| service | category, service_type | — | delivery, location, provider_role |
| goal | area, measure.task, measure.score_type | measure.instrument | condition |
| measurement | measure.task, measure.score_type | measure.instrument, measure.administration | — |
| progress_entry | goal_area, measure.task, measure.score_type | measure.instrument | — |
| accommodation | description, context | — | — |
| present_level | area | — | — |
| assessment_participation | assessment_name | — | — |
| transition | area | — | — |

Six record types are one per document or case (student, eligibility, placement, transfer of rights, ESY, document header) and carry no key.

## Document types (15)

`iep.plan`, `iep.amendment` (amends plan), `iep.progress`, `iep.eligibility`, four evaluations (academic, psychoeducational, speech-language by school evaluators; independent by an independent evaluator), `iep.evaluation.plan`, `iep.consent`, `iep.referral`, `iep.notice`, `iep.behavior.fba`, `iep.behavior.bip`, `parent.correspondence`. Each declares author role, ordering date, recognition signals, lineage links and a checklist of record types. Where a record is expected comes only from checklists.

## Requirements

Eleven rules cite 34 CFR 300.320(a)(1)–(7), (b), (c) and 300.503(b), jurisdiction US-federal, source effective 2006-10-13, status `CITED_PENDING_LEGAL_REVIEW`. Plan rules run against the operative plan (latest plan plus amendments) and are `not_applicable` when no plan is supplied. Transition applies from age 16 on the plan's start date; transfer of rights waits on the state age-of-majority table. No upload is required.

## Insight checks (8)

Baseline vs cited measure · need without goal · goal without present level · services down while progress insufficient · progress report coverage · testing accommodation not in assessment participation · baseline-to-target series · reevaluation interval (34 CFR 300.303(b)(2)). Each yields a question with chips on both sides. New engine primitives needed: `compareValues`, `absenceOf`, `coChange`, `elapsedSince`, `parseFrequency`, `shareOfTotal`, `exists`.

## Validation

`review-check.json`: 15 document types, 25 record types, 131 fields, 19 keyed record types, 11 rules, 8 checks, all L001 Initial IEP concepts mapped (29/29), no version axis in any key, all references valid, no callbacks, zero errors and warnings. The validator also fails on a `plan` key or a dangling field reference (tested).

```
tsc --strict --target es2020 --module commonjs --types node --outDir js validate-pack.ts
node js/validate-pack.js iep-pack.v0.3.proposed.json review-check.json
```

## Storage: file, not database

Keep the pack as a JSON file in the repository. It is the source of truth.

- **Versioned and reviewed** like code: every key or requirement change is a diff with a reviewer, which matches the change-record discipline.
- **Tested before it ships:** the validator and golden cases run in CI against the exact pack version.
- **Reproducible:** each case run stores the pack id, version and content hash, so any output can be traced to the pack that produced it.
- **Cache-friendly:** the prompt and schema are generated from a fixed file, so the cached prefix is stable between deploys.

Use the database only for runtime data around packs: which version is active per domain, the pack hash recorded on each case run, per-case user-supplied reference data (e.g. a household budget), and later Domain Forge drafts awaiting review. If hot updates without a deploy become necessary, publish the validated file's content into the database by version; still edit only the file.

## Open items before certification

1. Legal review of the 11 rules against current eCFR text; decide state-rule scope.
2. Fill `age_of_majority_by_state`; decide whether to support state transition ages.
3. Merge the repository vocabulary, rulebook, story and focus constructs.
4. Build the seven new engine primitives; run each check against golden cases.
5. Define the normalization and threshold for accommodation text and area matching.
6. Image-region evidence for scanned tables.
7. Owner review of the 12 parent explainers and 9 definitions.

## Next action

Review the identity table above record by record, then the `iep.plan` checklist. Approve keys before fields. Do not modify Core, production packs, graders or NEXT.md during review.
