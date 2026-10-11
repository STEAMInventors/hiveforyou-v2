# HiveForYou — Domain-Agnostic, Pack-Driven Architecture v2.0 (PROPOSED)

Date: 2026-10-11
Scope: Architecture specification and IEP Domain Pack review only.
Branch: `refactor/engine-boundary`
Status: Proposed; no runtime migration authorized.

> This document records the new architectural direction. It does **not** silently supersede the approved `brain/plan/AGENTIC-PLAN.md` v1.1 or change `NEXT.md` ticket status. Reconcile the execution plan only after explicit approval.

## 1. Non-negotiable boundary

**One engine, many declarative domain packs.** Hive Core must classify, extract, verify, resolve, combine, check, and render without any `if (domain === "iep")`, bankruptcy-specific logic, or pack-defined executable callbacks. A new pack registers data and uses the same universal versioned contract. If a domain proves an operation missing, add a domain-neutral primitive and conformance tests, never an exception.

**One document per model extraction call by default; case-level reasoning in code.** The model may receive the case manifest for reference, but **only the current document's pages** as its extraction evidence. New upload: process its document classification/extraction/verification, then recompute case projections. Long documents may be partitioned internally only with complete page coverage and deterministic merge, preserving document-level isolation.

**Model proposes; code disposes.** Model outputs are untrusted proposals until validated. No chip, no claim; no validated claim, no narrative statement. User intent influences ordering, never what gets extracted. Findings are questions, not legal verdicts.

## 2. End-to-end pipeline

| Step | Name | Owner | Input | Output / hard gate |
|---|---|---|---|---|
| 1 | Intake | Code/user | Uploads, intent, selected domain | Case, immutable sources, selected compatible pack/version |
| 2 | Classify | Model proposes; code validates | One document and pack document catalog | Proposed type, author/authority role, dates, parent/amendment references and **evidence where observable**; uncertainty retained |
| 3 | Extract | Model proposes; pack declares targets | Generated prompt+schema, case manifest, **one document** | Typed candidate facts, page/quote evidence, visibly blank fields and references to missing documents |
| 4 | Verify & resolve | Code | Candidates, source page model, pack metadata | Verified quote location, type/value/unit/modality, canonical entity links and permissible derived facts; unresolved links retained |
| 5 | Compose case | Code | Immutable verified facts, document lineage, effective times | Operative-as-of views, change, conflicts, matches/possiblySame, series and coverage; raw facts never overwritten |
| 6 | Insight checks | Code | Case view + declarative pack rules | Evidence-backed neutral questions; no unsupported conclusions |
| 7 | Meaning | Model proposes; code validates | Verified facts, findings, audience and intent | Plain language referencing validated IDs only; no new facts |
| 8 | Screens & export | Code | Validated facts/meaning/intent/persona | Customer and Pro projections, chips, evidence ledger/export |

Model calls in steps 2, 3 and 7 only. Classification and meaning may be separate reusable calls; they do not change extraction coverage. Empty or missing fields are not assertions that an absent record does not exist.

## 3. Universal Domain Pack contract — nine logical sections

A pack is versioned declarative data validated by a single `DomainPack` schema, optionally instantiated by Domain Forge. The existing `engine/domain-pack/src/types.ts` contract and `engine/domain-packs/iep/pack.ts` are migration starting points, not code to duplicate.

| Section | Pack data | Engine consumer |
|---|---|---|
| Audience | Layperson/Pro roles, default priorities, terminology | Meaning/screens |
| Document types | Type ID, recognition hints, role/authority, date fields, parent/amendment links, checklist references | Classify/compose |
| Fact types | Reusable fact ID and construct, value kind, identity-key fields, applicability, modality, evidence policy, allowed derivations | Prompt/schema, verifier, resolve/compose |
| Requirements | Conditional document/fact/period expectations, jurisdiction/date applicability and authoritative source | Missing/coverage |
| Insight checks | Declarative predicates composed from supported universal primitives, both-sided evidence, neutral question templates | Checks |
| Plain explainers | Short, reviewed audience-specific explanations of concepts/sections (no implied case facts) | Meaning/screens |
| Reading notes | Concise domain and optional document-type extraction guidance; no hidden requirements | Prompt generator |
| Vocabulary | Aliases, abbreviations, distinctions, units, field mapping hints | Prompt, normalization, UI |
| Reference tables | Effective-dated and jurisdiction-scoped thresholds with source/version | Checks |

**Fact definition once; document checklist references it.** Example: `service.minutes_per_week` is defined once. An initial IEP, amendment and progress record may mention it with different roles and modalities. Document-type checklists specify applicability/where to look, not copies of its data type.

**Field provenance** is `quoted`, `derived`, or `classified`. A fact type can allow quoted or derived instances: if 150 min/week appears, it is quoted; if 30 min/session and 5 sessions/week both appear and a declared formula permits it, it is derived with dependency chips. `weekly` alone cannot establish minutes. Classified outputs are labeled, correctable proposals, not verified quotations.

**Do not send golden answers, synthetic entity IDs or matching targets in extraction prompts.** The model emits observed labels and evidence; code resolves stable entity IDs where supported. Unresolved entities remain unresolved rather than fabricated.

**Pack safety:** No pack-provided arbitrary executable TypeScript/SQL/JS functions. No broad domain-specific runtime hooks. Keep definitions separate from user-supplied documents (untrusted text).

## 4. Universal deterministic primitives

- `identity`: resolve entities using typed key fields and scoped evidence; keep ambiguous candidates separate.
- `compose`: produce an operative-as-of view using explicit amendment targets, scopes, precedence and periods; preserve all original facts and supersession edges.
- `change`: compare compatible measures/keys across distinct effective periods; never confuse change with disagreement.
- `conflict`: compare compatible measures, subjects and overlapping times with incompatible assertions; author role informs interpretation but is not sufficient by itself.
- `matches` / `possiblySame`: definite equivalence only with sufficient keys; partial match is a review question and cannot auto-merge.
- `series`: same measure/key/unit semantics ordered by date; do not join different measures.
- `missing` / `periodCoverage`: apply documented, conditional requirements to supplied records; distinguish explicitly blank from not found in supplied documents and from not applicable.
- `arithmetic`, `ageOnDate`, `ratePerWeek`, `shareOfTotal`: operate only on verified inputs with valid units/periods, retaining derivation chains.

All primitives are domain neutral. No derived result is credited with a source quotation it does not directly possess; cite its verified operands.

## 5. Prompt and output contract

The engine renders one stable core prompt and a typed output schema from the **same pack snapshot**. Each document request includes: (a) core rules, (b) pack fact/document catalog and reading note, (c) case document manifest for cross-reference only, (d) classified document type and its **complete checklist**, (e) the current document's page-numbered words. The model must extract all applicable observable fields, not only those implied by the user's intent.

Output proposals include `catalogTypeId`, construct/key fields, ClaimValueV4, modality, evidence `{sourceDocumentId,page,quote}`, and uncertainty as appropriate. The verifier validates source/quote, type/value/unit/modality and semantics separately. Image-only content needs a verifiable image-region locator and a compatible verifier; do not treat a region as a verbatim quote.

Prompt caching is an optimization, not an architecture dependency: stable tool/schema → engine text → domain pack text → case manifest → document pages. Benchmark pricing and cache behavior with real provider metrics before setting breakpoint policy; verify current provider API requirements.

## 6. IEP pack v0.2: review boundaries

Preserve useful existing pieces of the current IEP pack:
- `engine/domain-packs/iep/pack.ts` + `manifest.ts`: registration and pack manifest.
- `document-types.ts`: L001 document-type recognition/discovery catalog; expand with explicit IEP amendment and typed checklists.
- `study/agents.ts`, `study/focus-constructs.ts`: existing reading methodology and high-level focus; replace broad prompt-only expectations with typed fact/checklist contracts.
- `vocabulary/`: abbreviations, aliases and study vocabulary.
- `evidence-requirements/requirements.ts`: currently empty; do **not** invent universal document requirements. Add only sourced, conditional requirements.
- `rulebook/`, `narrative.ts`, `story.ts`, `pro.ts`: migrate/reuse checked definitions and presentation labels; avoid duplicating meaning and assertions.

Review initial/annual IEP, amendment, progress, eligibility, academic evaluation, psychoeducational evaluation, speech-language evaluation, evaluation plan, consent and referral. Document discovery labels are not a substitute for exhaustive fact checklists. Shared fact types cover dates, students/entities, eligibility, present levels, each goal component (baseline, target, accuracy, measurement), service lines and minutes, placement, accommodations, document links and progress measures. Repeated rows must carry identity keys and evidence; avoid hardcoded L001-only names.

IEP requirements must be sourced and applicability-aware (e.g. document circumstances, jurisdiction, effective date), not inferred from a generic checklist. Legal source tables and program-specific checks never produce legal verdicts.

## 7. Verification and evaluation

Separate gates/metrics:
1. Proposal shape and field type compliance.
2. Provenance validity: document/page/quote or verified image locator.
3. Extraction correctness: value, unit, modality and expected concept/key.
4. Entity resolution correctness.
5. Cross-document assembly and insight correctness.

Golden examples are **evaluation data**, never runtime pack instructions. Preserve historical raw golden sets and benchmark results; introduce versioned, typed expected concepts/values and a compatibility report instead of destructively replacing entity IDs. Normalize harmless punctuation/whitespace only in the grader, with tests preserving meaningful distinctions. A shared evidence span can support more than one distinct fact when justified; scoring must not conflate their identities.

Known T3.9 L001 Initial IEP results: A 16/29, B 17/29, C 17/29; these do not establish architectural superiority because A was atomic-only while B and C covered relationships. A controlled follow-up compares equal full-case targets, prompt constraints and evidence criteria across one-document and case-wide methods. Avoid paid runs until contract and local tests pass.

## 8. Current scope, sequence and acceptance

**Current active scope: review/redefine IEP Domain Pack first.** No code edits or new model calls authorized by this document.

1. Inventory existing nine-section pack content, source of truth and compatibility dependencies.
2. Approve universal typed pack contract and IEP document taxonomy/checklist shape.
3. Define reusable IEP facts, keys, modalities, evidence and derived-field policies.
4. Map document-specific checklists onto fact types; audit coverage against L001 and additional IEP scenarios.
5. Review conditional missing requirements, checks, audience notes and legal reference provenance.
6. Only after specification approval, write implementation tickets; run pack conformance tests and preserve current runtime behavior until shadow qualification.

**Portability acceptance:** A future bankruptcy/Medicaid pack must validate, register and execute unchanged against the same Core and shared test suite, without domain-specific branches.

## 9. Open issues confined to pack review

- Exact typed schema and migration strategy for legacy `DomainPack` fields.
- Initial vs annual IEP and amendments: type/subtype and checklist inheritance.
- Source-specific versus general requirements and effective-dated jurisdiction extensions.
- Stable identity keys for goals, services, people and documents when records omit identifiers.
- Verifiable field-level evidence for scanned tables and images.

All non-pack engineering is parked until the IEP pack definition is approved.
