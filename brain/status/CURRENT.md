# Current State

Repository: HiveForYou V2  

Status: **V2-001E.1 COMPLETE** + **Engine 1 OpenAI Discover** (**frozen**) + **Engine 2 Canonical Study** (single runtime path: `canonical-study-v3` → `case-intelligence/3`; legacy `/2` rows may remain in DB but are not read)

## Implemented

- Repository structure, brain architecture, Cursor rules, pnpm monorepo

- **V2-001A–D** (frozen): upload → documents → document discovery → questions

- **V2-001E** (frozen): Canonical Study execution boundary, persisted evidence, prompt audit, Case Intelligence snapshots

- **V2-001E.1**: Domain Learning Foundation — relational question/answer history, study document snapshots, intelligence lineage, append-only domain learning observations, learning candidate contract (no auto pack mutation)

- **Shared contracts** (`packages/shared`): discovery, questions, domain-learning types; canonical case **`/3`** proposal + intelligence schema (aligned with [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md)); legacy `/2` contract files remain for historical rows only

- **Domain pack scaffold** (`packages/domain-packs`)

- **Core orchestration** (`packages/core`): `runCanonicalStudy` integrates learning prep (before Engine 2) and post-validation lineage/observations; `recordDomainLearningObservation`; in-memory + Supabase adapters
- **Engine 1 Discover** (`packages/core/discover`): `discover-v1` one-pass (unchanged) + **`discover-v2` adaptive** pipeline (`runAdaptiveDiscover`): upload/source verify → OpenAI **Call #1 collection understanding** (one domain group per resolved domainId; per-domain suggested objectives and audiences; no missing-document expectations; no pre-objective clarifications) → customer confirms objective and audience per domain (`CUSTOMER_ASSERTION`) → OpenAI **Call #2** only if more customer input is needed → one final discovery validation → Structure Map → pack completeness once per domain → Engine 2 receives that domain's documents, structure map, and objective only

- **Case Intelligence** (`packages/canonical`)

- **Web**: development-only server-side Supabase auto sign-in when `NODE_ENV=development` and `HIVE_DEV_AUTH_EMAIL` / `HIVE_DEV_AUTH_PASSWORD` are set (middleware + `getAuthenticatedUserId`; never in production or client bundles); study flow — `StudyExperience` leaves the processing state on `run.status` `SUCCEEDED` / `NEEDS_REVIEW` after `POST /api/study/run` (React Strict Mode–safe; no `startedRef` gate blocking effect re-runs); `POST /api/study/run` is server-side idempotent (in-flight dedupe + `(case_id, idempotency_key)` persistence recovery, discover-run pattern); Supabase persistence including domain learning via service-role for cross-case observation store; document discovery UX — staged collection stays visible under a centered processing modal (hex animation, current stage, compact checklist); **Understand my documents** opens that modal immediately (before upload commit / discover API); same modal switches after Call #1 for domain-level intent (one domain skips the overview; two or more unique domains show “I found a few different areas in your documents” with one card per domain, then objective and audience for each domain; suggestions are model proposals plus pack audience roles; Something else / Just for me / Someone else stay available) / clarification input then back to processing on Continue; on complete modal closes and page shows compact grouped inventory (domain sections when multi-domain) with optional timeline/relationships expand; upload flow uses compact staged file list (~one viewport with CTA). Processing modal **does not settle on the local fixture until the discover API run finishes** (including while upload persist gates `discoveryActive` before the first discover call) so `NEEDS_OBJECTIVE_INPUT` / `NEEDS_DISCOVERY_INPUT` reliably reopen the customer-input modal; terminal `FAILED` / incomplete discover payloads surface a retry error instead of spinning on the last stage; dev-only discover boundary logging on client, API routes, and adaptive continue/finalize. Neutral “Organizing your documents” copy during processing until a validated structure map is available (no premature Special-education domain line). Model suggestions are proposals only; persisted context is customer-confirmed `CUSTOMER_ASSERTION`.

- **Persistence**: prior V2-001E tables plus `case_questions`, `case_question_answers`, `study_run_question_answers`, `study_run_documents`, `intelligence_lineage`, `domain_learning_observations`, `domain_learning_candidates` (+ observation join); `discover_runs`, `discover_artifacts`, `discover_questions`, `discover_customer_answers`; **`case_customer_context`** (OBJECTIVE / SHARE_INTENT / INTENDED_AUDIENCE, CUSTOMER_ASSERTION, supersession history, one active row per `case_id + domain_id + context_type`). A discover retry updates the existing `discover_runs` row for `(case_id, idempotency_key)` and keeps that row's id; concurrent inserts on that unique key recover by loading the winning row and continuing with its id. Discover orchestration re-reads the idempotency row after each run save so artifact/question writes always use the canonical `discover_run_id` (avoids FK failures when save returns a stale client-generated id).

- Tests: core domain learning, migration contract, RLS adapter checks, existing V2-001A–E suites

## Engine 2 / privacy

- `HIVE_CANONICAL_STUDY_ENGINE=openai` for production study when `OPENAI_API_KEY` + model configured; `fixture` for explicit tests/dev only. Unset or any other value **fail-closes** (`ENGINE_UNAVAILABLE`). Fixture proposals **cannot persist** case intelligence or projections outside `NODE_ENV=test` (`FIXTURE_MODE_NOT_ALLOWED`).
- Study idempotency fingerprint includes provider mode, model id, and prompt version/hash (engine config changes force a new run without touching Q&A).
- Study start logs provider mode, proposal mode, model id, prompt version, case/study run id only (no source content).

- Engine 2 prompt is fixed to `packages/core/prompts/canonical-study/canonical-study-v3.md` (no env dispatch). API/transport failure → `ENGINE_UNAVAILABLE`; response received but not parseable/contract-valid → `MALFORMED_PROPOSAL`.

- **Engine 2:** `runCanonicalStudy` → OpenAI/fixture v3 engine → `validateCanonicalStudyProposalV3` → `buildCanonicalCaseSnapshot` → v3 Customer/Pro projections; Structure Map + Engine 1 discovery in context; **`discoveryRunId` required on study start when Structure Map loader is wired** (client session → `StartCanonicalStudyRequest` → `loadStructureMap(discoveryRunId)` → frozen `logicalDocuments`); physical source set from Engine 1 discovery ids; `hive.study_artifacts` on every run; no `/2` fallback in bundle or study paths.

- **Engine 2 (approved target — [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md)):** Model performs semantic study; constructs are model-discovered strings; deterministic validation is structure, referential integrity, provenance, locators, value shape, snapshot integrity; Domain Packs are optional context only. **Withdrawn:** construct catalog, APPLY_DOMAIN_PACK gating, pack allowlists, unrecognized_construct rejection, pack-derived missing_construct/missing_event.

- Domain learning observations store structured keys/metadata only — not raw document text, free-text answers, or Case Intelligence payloads.

## Engine 1 / Discover

- **Frozen.** No redesign under V2-001G.
- `HIVE_DISCOVER_ENGINE=fixture` for explicit dev/test; `openai` uses Supabase Storage bytes → OpenAI Responses strict JSON schema (all object `required` keys match `properties`; optional proposal fields use nullable types; no silent fallback to fixture).
- `HIVE_DISCOVER_PROMPT_VERSION=discover-v1` (legacy) or `discover-v2` (adaptive Structure Map path); rejects `latest`.
- IEP Discover Pack `documentTypes` aligned to L001 corpus (nine canonical types + `Document (unclassified)`); vocabulary injected via `composeDiscoverPromptInputs` → `domainPackVocabulary`.
- Collection Call #1 validation: `SINGLE_DOMAIN` / `MULTI_DOMAIN` keyed on **unique resolved `domainId`**; `domainGroups` is domain routing only (exactly one entry per domain). Each domain group carries that domain's suggested objectives and audiences. Pack categories (evaluations, planning, progress, …) live on `logicalDocuments.groupId`; code derives UI categories after validation. V2 OpenAI schema has no `missingExpectedDocuments` — pack completeness runs once per domain after validated discovery. A useful document type missing from a scaffold pack is kept, with `recognitionStatus: proposed_type`. Primary inventory is domain sections, so the same logical document is not listed twice. Customer objective and audience are confirmed per domain inside the same modal. Engine 2 receives the domain objective only; audience stays on the customer projection.

## V2-001G (canonical case)

- **Authoritative architecture:** [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md) (corrected; supersedes pack-catalog slice plan).
- [ADR-006](../decisions/ADR-006-engine2-canonical-study.md) — N domain studies + merge → one canonical case; running schema `/2`; strict logical-document provenance; customer context never evidence.
- **Slice 1A (contracts):** `@hiveforyou/shared/case-intelligence/3` — model-discovered constructs, `ProposedMissingInformation`, simplified `UnresolvedItem` kinds; withdrawn pack-gating removed from `/3` schema. **Runtime:** study and snapshot builder still **`/2`**.
- Case UI: Overview / **Canonical Study** / Sources (no Timeline); bundle loader loads latest **`case-intelligence/3`** only; `GET /api/case/[caseId]/bundle`; dev script `packages/core/scripts/openai-l001-canonical-study-v3.mjs`.
- Migrations: `20260928180000_engine2_study_artifacts_projections.sql` (**must be applied** on remote Supabase); **`answer_snapshots`** idempotent; **`intelligence_lineage.logical_document_id`**
- Held: multi-domain orchestrator + merge; optional pack display labels (not validation); canonical-case runtime slices after Slice 1A
- **Case UI (Stitch-aligned shell):** `/case` route; Customer/Pro switch; Overview / Canonical Study / Sources; dynamic domain filters; evidence drawer; projections on study success via `hive.case_projections`; provenance bundle `case-provenance-bundle/1`

## Not implemented

- Case Map (V2-001F) — not started

- Analytics dashboards, automatic learning candidate generation, automatic Domain Pack modification

- Payments, Pro unlock

- Multi-domain Engine 2 merge orchestrator

## Principles

- **Engine 1:** Model proposes. Pack defines. Code validates. Professional decides. **Engine 2:** Evidence provides reality; **model studies and proposes (semantic)**; **code validates structure, provenance, and integrity (deterministic)**; canonical truth drives both views.

- **Every case produces private Case Intelligence and structured Domain Learning Observations.**

- **Cases → Observations → Learning Candidates → Review/Test → Certification → Domain Pack**

- **Hive must preserve enough history to learn not only what a case means, but what information was necessary to understand it.**

**Evidence determines truth. User intent determines focus.**
