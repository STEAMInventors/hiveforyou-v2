# HiveForYou — Domain-Agnostic, Pack-Driven Architecture v2.0 (PROPOSED)

Date: 2026-10-11 (base); **ARCH-01 amendment: 2026-10-12**; **Canonical Study Graph: v1.3 — 2026-10-18**; **Finalized decisions 1–3: v1.4 — 2026-10-18**
Scope: Architecture specification; IEP Domain Pack review continues in parallel.
Branch: `refactor/engine-boundary`
Status: **PROPOSED ONLY — not production-active.** Production today remains OpenAI **canonical-study v4/v4.1** → validated **`case-intelligence/3`**, pack-driven Reader qualification paths, and existing projections until **Phase H** activation is explicitly approved in [NEXT.md](../status/NEXT.md). ARCH-01 documentation remains valid for the extraction/Inspector track; v1.3–v1.4 describe the **approved target** Canonical Study and Domain Pack contract — **not** current runtime behavior unless explicitly labeled below.

> **v1.4 — Finalized architectural decisions (2026-10-18)** records **Decision 1 (Universal Canonical Study)**, **Decision 2 (Minimal schema-first Domain Pack)**, and **Decision 3 (Explicit Pack execution contracts per stage)**. See [§ v1.4 — Finalized decisions](#v14--finalized-architectural-decisions-2026-10-18). Implementation tickets **DP-01 … DP-04** and **CS-vNext-E … H** are tracked in [AGENTIC-PLAN.md](./AGENTIC-PLAN.md); **none are authorized** until separately approved in [NEXT.md](../status/NEXT.md).
>
> **v1.3 — Canonical Study Graph (2026-10-18)** amends the **target** Engine 2 path: **Reader → immutable Observations → model-driven Canonical Reasoner → deterministic Graph Validator → authoritative Canonical Graph (`hive.canonical-study-graph/1`) → Writer / persona projections.** See [§ v1.3 — Canonical Study Graph architecture](#v13--canonical-study-graph-architecture-proposed-2026-10-18). **Does not** authorize runtime migration, orchestration wiring, or production cutover.
>
> **ARCH-01 (2026-10-12)** records the simplified **pack-driven extraction path** (Engine 1 boundaries → parallel Anthropic Reader → per-document raw persistence → temporary Extraction Inspector). Cross-document canonical consolidation and Customer/Pro reports are **explicitly deferred** on the ARCH-01 track; v1.3 **supersedes the consolidation *shape*** for the Canonical Study vNext workstream while **preserving** ARCH-01 extraction/Inspector history. See [§ ARCH-01](#arch-01--simplified-pack-driven-extraction-path-approved-2026-10-12).
>
> **Authorization boundary:** Architecture amendments are **documentation** unless paired with an authorized ticket in `NEXT.md`. **IEP Domain Pack v0.2 review** remains a **parallel, pack-scoped** specification effort — not authorization to add domain logic to Hive Core.

**Historical sources (ARCH-01 reconciliation):** Approved Agentic Plan v1.1 and its REPO-MAP are preserved as immutable snapshots — [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md), [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md). The living plan amendment is [AGENTIC-PLAN.md](./AGENTIC-PLAN.md) (**v1.3**); ticket execution and SHA history remain in [NEXT.md](../status/NEXT.md). Completed T3.x Reader work remains historical.

**Governing version for Canonical Study vNext and Domain Pack tickets:** cite **`HIVE-ARCHITECTURE-V2-PROPOSED.md` v1.4** (decisions + v1.3 pipeline) and acceptance criteria in [AGENTIC-PLAN.md](./AGENTIC-PLAN.md) § Canonical Study vNext and § Domain Pack track.

---

## v1.4 — Finalized architectural decisions (2026-10-18)

These decisions are **approved target architecture**. **Production runtime** (OpenAI v4/v4.1 → `case-intelligence/3`, legacy pack surfaces, qualification Reader paths) is unchanged until **CS-vNext-H** and related tickets are explicitly authorized and activated.

### Decision 1 — Universal Canonical Study

Hive Core maintains **one domain-agnostic authoritative Canonical Graph** per accepted study attempt. The graph is **independent of reports** and **does not discard** conflicting or historical information; domain-specific structured views are **projections** from the accepted graph only.

| Element | Role | Target mutability | Notes |
|---------|------|-------------------|--------|
| **Observables** | Stable identities for things-in-the-world (entity **occurrences** — who/what/when/where roles) | Proposed by Reasoner; accepted only after validation | **Separated from** factual assertions (Observations) |
| **Observations** | Immutable, evidence-backed assertions about observables (predicate, value, role, evidence refs) | **Immutable** once in `hive.observation-snapshot/1` | Normalizer output; never silently merge distinct reader assertions |
| **Resolutions** | Cross-document identity merge, operative choice, conflict disposition | Proposed by Reasoner; accepted / rejected / **unresolved** by Validator | Must cite observation ids; referential integrity enforced in code |
| **Relationships** | Typed edges between observables per pack relationship definitions | Proposed → validated | Endpoints and temporal/comparison semantics from Pack §3 |
| **Conflicts** | Explicit incompatible assertions or resolution outcomes | Retained in graph partition | Not flattened away for UI convenience |
| **Chronology** | Ordered events / intervals with provenance | Proposed → validated | Domain timing rules from Pack §3 |
| **Unresolved items** | Validator- or reasoner-marked gaps the graph does not force closed | **Preserved** | Fail-closed factual surfaces; no invented closure |
| **Provenance** | Evidence refs, artifact lineage, pack pins, model pins | Append-only on accepted artifacts | **No chip → no claim** on Customer/Pro factual representation |

**Runtime today (not Decision 1):** monolithic **`case-intelligence/3`** snapshot from OpenAI canonical-study v4/v4.1; local vNext modules (Phases B–D) implement contracts and reasoner **without** production graph authority or worker orchestration.

### Decision 2 — Minimal schema-first Domain Pack

The **approved target** pack contract has **four logical sections** (JSON Schema / Pydantic–compatible declarative data):

1. **Domain Schema** — domain entities, fields, types, descriptions, allowed values.
2. **Document Profiles** — supported document types, recognition instructions, expected extraction content per profile.
3. **Relationships and Constraints** — domain relationships, endpoints, identity guidance, temporal and comparison semantics.
4. **Personas** — audience-specific report requirements and entitlement identifiers.

**Migration (mandatory before cutover):** IEP **v0.2.1** and legacy surfaces (`DomainPack` registry, `packs-v2` proposal YAML, `study-agents/1`, pack-driven reader proposal JSON) remain **in repo today**. Do **not** introduce a redundant parallel pack format without an explicit **migration and compatibility plan** (ticket **DP-02**). Until migration is qualified, compilers may **adapt** legacy definitions into stage-specific compiled views; that adaptation is **not** a second source of truth.

**Generic Domain Pack:** a versioned **Generic** pack is **mandatory fallback only** when no compatible specialized pack exists or domain resolution is genuinely unknown. Resolution order and compatibility rules are defined in **DP-02** (not implemented).

**Pack pinning and failure:** Each run pins **`packId`**, **`packVersion`**, and **content digest**. A broken, invalid, incompatible, or digest-mismatched specialized pack **must fail explicitly**. **Never** silently switch away from a pinned pack mid-run.

### Decision 3 — Explicit Domain Pack execution contracts

For each processing stage, the pack contract specifies what the pack **defines**, what is **supplied to the model** vs **enforced in code**, processing **responsibility**, **versioned output artifact**, **deterministic compliance checks**, and **failure / unresolved behavior** (plus a compliance record). **No domain-specific processing branches in Hive Core** — only generic orchestration, validation, and pack compilation.

See [§ Domain Pack execution contracts (by stage)](#domain-pack-execution-contracts-by-stage--approved-target). Stage implementation and qualification are ticketed **DP-03** (Discover, Reader, Normalizer), **DP-04** (Reasoner + gaps), **CS-vNext-E** (Graph Validator), **CS-vNext-F** (Writer, Application entitlements).

### Ticket dependency (approved sequencing — not authorization)

```text
DP-01 → DP-02 → DP-03 → DP-04 → CS-vNext-E → CS-vNext-F → CS-vNext-G → CS-vNext-H
```

**Parallel history preserved:** ARCH-01 … ARCH-06, Agentic Phases 0–8, T3.x Reader, and **CS-vNext Phases A–D** (D **implemented locally, uncommitted, live Anthropic qualification pending**) remain in plan tables; **DP-03/DP-04** reconcile pack consumption with that work rather than re-opening closed Phase B/C tickets without approval.

---

## v1.3 — Canonical Study Graph architecture (PROPOSED — 2026-10-18)

### Intent

Replace **monolithic OpenAI canonical-study proposal → `/3` snapshot** as the **long-term authoritative case truth** with a **versioned graph contract** built from **immutable observations** and a **model-driven reasoner**, then **deterministic validation**. Customer/Pro surfaces, Living Case UI, and Hive Writer consume **only an accepted graph** (or deterministic projections derived from it). **Prior accepted studies and generated reports remain immutable** once published.

**Production until Phase H:** unchanged — worker `MODEL_*` OpenAI v4/v4.1, `case-intelligence/3`, existing report routes, pack-driven Reader qualification, ARCH-01 extraction targets where locally implemented but not deployed.

### End-to-end pipeline (target)

```text
Engine 1 (intake, pages, structure map, source documents)
  → Reader (parallel per logical document; pack-driven or legacy qualification)
  → Verified reader facts (reader-accepted-facts/1 or successor)
  → Observation Normalizer (deterministic) → hive.observation-snapshot/1  [immutable]
  → Canonical Reasoner (model proposes graph delta) → canonical-study-reasoner-proposal/1
  → Graph Validator (deterministic) → canonical-study-graph-validation/1
  → Accepted Canonical Graph → hive.canonical-study-graph/1  [authoritative]
  → Writer (optional UI tree) + deterministic persona report projections
  → Customer / Pro / Living Case UI (persona-specific; entitlement-gated where required)
```

Each **Canonical Study** is an **independent persisted run** (`studyRunId`, monotonic **`attemptId`** per reasoner/validation cycle). Each **Writer generation** uses a distinct **`writerRunId`**; regeneration never mutates an accepted graph or a prior accepted report artifact.

### Canonical Graph elements (Decision 1 — domain-neutral names)

| Element | Role | Mutability | Owner |
|---------|------|------------|-------|
| **Observable** | Entity **occurrence** identity (person, goal, service, document role) — not the assertion | Proposed by Reasoner; **accepted only after validation** | Reasoner proposes; Validator + pack rules dispose |
| **Observation** | Evidence-backed **factual assertion** about an observable | **Immutable** once in `hive.observation-snapshot/1` | Normalizer (from verified Reader facts) |
| **Resolution** | Identity merge, operative choice, conflict outcome | Proposed; **accepted / rejected / unresolved** | Reasoner + Validator |
| **Relationship** | Pack-typed link between observables | Proposed → validated | Reasoner + Validator (Pack §3) |
| **Conflict** | Incompatible facts or unresolved opposition | **Retained** in accepted partition or unresolved | Reasoner proposes; Validator enforces evidence rules |
| **Chronology** | Events / intervals with provenance | Proposed → validated | Reasoner + Validator |
| **Unresolved** | Explicit non-closure (missing evidence, identity, pack rule) | **Preserved** | Validator; no silent invention |
| **Provenance** | Evidence refs, pins, lineage | Append-only on accepted artifacts | Core persistence |

Observations **never** silently merge distinct reader assertions (duplicate evidence signatures remain distinct rows). Resolutions **must** cite observation ids and satisfy referential integrity. **Reports and UI trees are not authoritative**; they consume projections from **`hive.canonical-study-graph/1`** only.

### Versioned contracts (source-level provenance)

| Schema id | Purpose |
|-----------|---------|
| `reader-accepted-facts/1` | Verifier-backed Reader output (qualification / legacy hot path) |
| `hive.observation-snapshot/1` | Immutable normalized observations + content digest |
| `canonical-study-reasoner-proposal/1` | Untrusted model graph proposal |
| `canonical-study-graph-validation/1` | Deterministic partition: accepted / rejected / unresolved |
| `hive.canonical-study-graph/1` | **Authoritative** accepted graph |
| `hive.canonical-study-projection-manifest/1` | Read-only lineage for derived persona projections |
| `canonical-study-report/1` | Deterministic factual report body (existing three-contract boundary) |
| `hive-ui-tree/1` | Presentation-only; Writer proposes; no factual mutation |

Storage path helpers (proposed layout): `@hiveforyou/shared/hive-artifact-paths` — observation snapshot, reasoner proposal, validation result, accepted graph, projection manifests.

### Hive Core vs Domain Pack (v1.3 + Decision 2)

- **Hive Core:** orchestration, pack compile/load, observation normalization mechanics, reasoner **port**, graph validation, persistence slots, entitlement enforcement hooks, UI adapters — **no domain vocabulary branches** and **no `if (domain === …)` fact logic**.
- **Domain Pack (Decision 2 — four sections):** Domain Schema; Document Profiles; Relationships and Constraints; Personas — **declarative, typed, versioned**, pinned per run (`packId`, `packVersion`, content digest). Stage-specific compiled views (Discover vocabulary, Reader extraction profile, normalizer field maps, reasoner entity/relationship catalog, validator rules, writer personas) are **projections of the same pack pin**, not alternate pack formats.

### Writer, personas, UI, entitlement

- **Writer** consumes **only** `hive.canonical-study-graph/1` (accepted) plus pack persona config; proposes **`hive-ui-tree/1`** only.
- **Persona-specific** Customer and Pro report projections and **Living Case UI** are deterministic adapters from the accepted graph + pack personas (same underlying truth).
- **Server-enforced payment entitlement** for designated Pro/premium reports — fail closed; no canonical mutation on unlock.
- **Separate inspection UIs:** Canonical Study graph inspection (facts, provenance, validation issues) vs Writer report preview (presentation). Neither replaces the other.

### Immutable history

- Accepted **`hive.canonical-study-graph/1`** for `(studyRunId, attemptId)` is append-only; new attempts supersede for *new* work but **do not rewrite** prior accepted artifacts.
- Accepted **report artifacts** and **writerRunId** outputs are similarly immutable; regeneration creates new ids.

### Proposed changes to deterministic consolidation (explicit)

The following **v1.1 / ARCH-01 “Phase B consolidation” responsibilities** are **proposed to move or split** under v1.3. **Production code has not been cut over.**

| Former responsibility (consolidation-era) | v1.3 disposition |
|---------------------------------------------|------------------|
| Single OpenAI call emits full **`case-intelligence/3`** semantic case | **Split:** Reasoner proposes graph; Validator enforces structure/provenance; accepted graph **replaces** monolithic proposal as authority |
| Deterministic **`normalizeCanonicalStudyProposalV4`** as primary gate | **Narrowed:** proposal validation applies to **reasoner proposal** schema; graph acceptance uses **`validateAcceptedCanonicalStudyGraph`** |
| Cross-document entity linking inside one proposal JSON | **Moved to Reasoner + Resolution** proposals with Validator referential checks |
| Operative plan / conflict / change detection in one consolidation pass | **Split:** Reasoner proposes resolutions/conflicts; Validator accepts or marks unresolved; deterministic projections read accepted graph |
| **`projectCaseViewV2` / customer-view** directly from `/3` snapshot | **Re-targeted:** persona projections from **`hive.canonical-study-graph/1`** (+ manifests), not from raw model proposal |
| Pack construct whitelist / missing_construct rejection | **Withdrawn** (unchanged from [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md)) |
| ARCH-01 deferred “verify then consolidate in one pipeline pass” | **Superseded for vNext sequencing** by Observation → Reasoner → Validator chain; ARCH-01 raw persistence + Inspector remain valid **parallel** extraction track until merged by explicit ticket |

**Unchanged laws:** Model proposes. Pack defines. Code validates. Professional decides. **No chip → no claim** on Customer/Pro factual surfaces. Inspector / debug views may show unvalidated model output with clear labeling.

### v1.3 acceptance criteria (documentation + phased implementation)

Documented in [AGENTIC-PLAN.md](./AGENTIC-PLAN.md) § Canonical Study vNext (Phases A–H). Phase-level implementation requires explicit `NEXT.md` authorization per phase.

**Execution status (2026-10-18, local/uncommitted):** Phase **C** evidence-integrity review **complete** — L001 qualification artifact **100** Reader facts → **100** observations after **C.1** generic `period` wire mapping (prior **2**× `INVALID_VALUE` quarantines on Reader `periodStart`/`periodEnd` transport). Stable observation ids and snapshot `contentDigest` confirmed on repeat runs. Reader `verificationStatus: "proposed"` on accepted-facts wire rows is expected verifier metadata. `@hiveforyou/shared` typecheck failures cited in Phase B remain **pre-existing** and unrelated to graph contracts. **Checkpoint commit (B–C.1):** `c7213690756ae0c3c10d52b2ce9a54e16c37937e`. **Phase D (Canonical Reasoner)** implemented locally — **uncommitted**; production OpenAI v4 path unchanged; **Phase E+ not authorized**.

### Phase D — Canonical Reasoner model strategy (approved for implementation)

| Item | Choice |
|------|--------|
| Initial provider | **Anthropic** via shared `CallModel` using **existing** deploy env only: `MODEL_PROVIDER=anthropic`, `HIVE_ANTHROPIC_API_KEY` (and optional `HIVE_ANTHROPIC_WORKSPACE_ID`) — **no silent substitution** if credentials or provider missing |
| Model id | **`MODEL_NAME`** (and existing max-token / reasoning envs already used by `CallModel`) — **no new reasoner-specific env vars** |
| Live vs fixture | **CLI / harness flags** (`--live`, `--replay`, fixture path args) — default deterministic fixture in tests; **not** new feature-flag env |
| Prompt | Generic `canonical-reasoner-v1.md` — `promptId=canonical-reasoner`, `promptVersion=1.0.0`, SHA-256 pinned in `modelPin` |
| Structured output | Strict JSON schema (graph body only); Core injects `schemaVersion`, study pins, and `modelPin` |
| Pack context | `compileDeclarativeCanonicalReasonerContext` → `hive.canonical-reasoner-pack-context/1`; digest pinned on request (`compiledPackContextSha256`). **Gap:** declarative v0.2 has no dedicated `observableTypes[]` catalog — endpoints derived from relationship `from`/`to` until pack contract extended (**DP-04**) |
| Phase D validation | JSON schema + observation-id referential checks only; **not** semantic graph acceptance (Phase E) |
| v1.4 acceptance | **Zero new environment variables** for Universal Canonical Study qualification — see [AGENTIC-PLAN.md § Zero new environment variables](./AGENTIC-PLAN.md#zero-new-environment-variables-v14-acceptance--mandatory) |

### Universal qualification harness (proposed)

Single stage-selectable CLI at repo root — **`pnpm hive:test --case <id> --stage <discover|reader|normalize|reasoner|validator|writer|all> [--live]`** — wrapping `@hiveforyou/eval` and existing stage scripts. **Not implemented**; interim gates documented in [NEXT.md](../status/NEXT.md#universal-qualification-gates-interim-until-hivetest).

---

## ARCH-01 — Simplified pack-driven extraction path (approved 2026-10-12)

### Intent

Reduce moving parts between **source preparation** and **human inspection** of model output. The first shippable V2 extraction loop is:

1. **Engine 1 (Hive Core, domain-agnostic)** — ingestion, text/page preparation, document identity, logical boundaries, structure map, and case manifest metadata. Engine 1 **does not** decide domain-specific facts or run semantic fact acceptance.
2. **Anthropic Reader (hive-agents)** — receives a **compiled Domain Pack** snapshot (proposal JSON today; registered pack snapshot when wired). Processes **logical documents concurrently** (default concurrency **8**). Each document produces **one structured JSON** result: classification, extracted information, uncertainties, and **model-attributed provenance** (page/quote fields in the extraction schema).
3. **Raw persistence (new contract — not fully implemented)** — for each logical document and each attempt, persist the **complete original model response** when available, including failed or malformed attempts. Structural/parsing diagnostics are recorded alongside; diagnostics **must not** be used to silently discard stored original output.
4. **No semantic gate between extraction and raw persistence** — do **not** run verifier-backed fact acceptance, candidate normalization rejection, or “no chip → no claim” enforcement **between** the model call and raw persistence. Those rules apply to **validated downstream reports**, not to the Inspector.
5. **Partial failure tolerance** — model-call failures are recorded with **study run id**, **source document id**, **attempt id**, **timestamp**, and **sanitized error details** (class/code/message summary; no document text). Successful documents **must survive** when sibling documents fail.
6. **Temporary Extraction Inspector** — authenticated, **independent of canonical consolidation**; displays **unvalidated** model claims and raw/parsed payloads for review. Not Customer/Pro case intelligence.
7. **Deferred phase** — cross-document entity resolution, operative plans, conflicts, changes, canonical case intelligence, and Customer/Pro projections **after** extraction + Inspector qualification.
8. **Hive Core stays domain-agnostic** — IEP vocabulary, reading notes, checklists, record types, and extraction JSON schema definitions belong in the **IEP Domain Pack** (and shared pack compiler), not in Core conditionals.
9. **Production compatibility** — legacy **OpenAI canonical study v4/v4.1** (`MODEL_*` on worker), shared services (Supabase, Inngest, document-pages bucket), and existing production study paths remain until explicitly migrated behind flags.

### End-to-end flow (ARCH-01 phase)

```text
Upload / Intake
  → Engine 1: extract pages, identity, Discover structure map, logical documents
  → Worker: fan-out N logical documents (bounded concurrency)
  → hive-agents Reader (pack_driven): 1 model call / document, compiled pack + manifest + pages
  → Persist raw model response + parse diagnostics (per document, per attempt)
  → Extraction Inspector (read unvalidated extractions)
  ——— deferred ———
  → Verify / normalize / consolidate → Case Intelligence → Projections (Customer/Pro)
```

### Proposed JSON persistence envelope

**Schema id (proposed):** `hive.reader-document-extraction/1`

One row or object-store object **per (studyRunId, attemptId, sourceDocumentId)**. Append-only per attempt; retries create new `attemptId` or monotonic attempt sequence (storage choice — see open questions).

| Field | Required | Description |
|--------|----------|-------------|
| `schemaVersion` | yes | `"hive.reader-document-extraction/1"` |
| `studyRunId` | yes | Study run UUID |
| `attemptId` | yes | Correlates with `agent_run_trace_events` when trace is enabled |
| `caseId` | yes | Case UUID |
| `userId` | yes | Owner for RLS |
| `sourceDocumentId` | yes | Persisted source document UUID (Engine 1 register) |
| `logicalDocumentId` | no | From structure map when present |
| `occurredAt` | yes | ISO timestamp of model call completion or failure |
| `domainId` | yes | e.g. `iep` |
| `packId` | yes | From compiled pack manifest |
| `packVersion` | yes | From compiled pack manifest |
| `packContentSha256` | yes | Hash of pack bytes used for compile |
| `promptVersion` | yes | e.g. `hive-pack-driven-reader/0.2.0` |
| `modelProvider` | yes | e.g. `anthropic` |
| `modelId` | yes | Effective model name |
| `status` | yes | `succeeded` \| `model_failed` \| `malformed_response` \| `empty_response` |
| `rawModelResponse` | conditional | **Full provider payload or verbatim model text** when any bytes returned; null only when provider returned nothing |
| `rawModelResponseContentType` | no | e.g. `application/json`, `text/plain` |
| `parsedExtraction` | no | Parsed object when parse succeeds; null when not parseable |
| `parseDiagnostics` | yes | `{ ok: boolean, errors: string[], needsReview?: boolean }` — never substitutes for missing `rawModelResponse` |
| `usage` | no | Token/cache usage summary |
| `latencyMs` | no | Model call wall time |
| `sanitizedError` | no | On failure: `{ code, message, httpStatus? }` — no document text |

**Provenance expectations (model output, pre-verification):**

- Extraction JSON follows pack compiler output schema (`hive.pack-driven-reader-extraction/0.2.0`): top-level `documentTypeId`, `recordInstances[]`, field-level `evidence: { sourceDocumentId, page, quote }`, `missingState`, `provenance` (`quoted` \| `classified`).
- Inspector shows these as **proposals**; chips in Customer/Pro UI still require verified canonical claims later.
- Engine 1 may supply **non-evidence** manifest fields (`engine1DocumentTypeId`, filename, page counts) for context only.

**Relationship to existing persistence (today’s repo):**

| Artifact | Role today | ARCH-01 target |
|----------|------------|----------------|
| `hive.agent_run_trace_events` | Append-only lifecycle/tool/verifier audit | Retain; extend payload conventions for pack-driven failures; **not** a substitute for raw model bodies |
| Private storage `reader-accepted-facts/1` | Verifier-accepted candidates for golden grading | **Legacy qualification path**; not the ARCH-01 raw persistence contract |
| `POST /study/reader` `study-reader/1` | Returns `candidateFacts`, `acceptedCandidateFacts`, `perDocumentResults` | Wire shape informs Inspector; **raw envelope persistence is additional** |
| `HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON` | IEP v0.3 proposed pack path in Oracle image | **Domain pack configuration** (see configuration section) |

### Error handling (ARCH-01)

| Situation | Behavior |
|-----------|----------|
| Model HTTP/transport error | Persist failure envelope; other documents continue; study run records partial completion |
| Empty model body | `status: empty_response`; persist diagnostics; retain any trace metadata |
| Non-JSON or schema mismatch | `status: malformed_response`; store **raw** body + `parseDiagnostics.errors` |
| JSON parse OK, semantic parse fails | Store raw + parsed fragment if safe + diagnostics; **do not drop raw** |
| Missing document task in fan-in | Failure row with `document_task_missing_from_fan_in` (align with current pack-driven fan-in semantics) |
| Classification `UNKNOWN` / `AMBIGUOUS` | Valid extraction outcome; Inspector flags review; **not** a silent discard |

### Temporary Extraction Inspector (requirements)

- Authenticated (same Supabase session as app); **no** requirement to load `case_intelligence` or projections.
- Lists study runs / attempts with per-document status and links to stored envelopes.
- Renders `parsedExtraction` when present; falls back to formatted `rawModelResponse`.
- Shows model-attributed quotes/pages as **unvalidated** with clear labeling.
- Out of scope for ARCH-01 implementation ticket: editing packs, re-running models, or publishing to Customer/Pro.

### ARCH-01 acceptance criteria (documentation + future implementation)

1. Engine 1 outputs trusted `document-pages`, registered `sourceDocumentId`s, and `engine1ReaderContextJson` without domain-specific fact logic in Core.
2. Reader runs **parallel_document** semantics: one Anthropic call per logical document, default concurrency **8**, pack compiled from versioned domain pack data.
3. Every attempt leaves a retrievable **raw persistence envelope** per document or explicit failure record.
4. No verifier or candidate normalization runs **before** raw persistence in the ARCH-01 path.
5. Inspector can display stored extractions without canonical consolidation.
6. OpenAI v4.1 canonical study path unchanged when selected (`processingMode: canonical_openai_v4`).
7. Configuration inventory documented; target minimal Reader env surface agreed before deletion.

---

## Superseded or deferred provisions (do not delete — architectural history)

| Provision | Original location | ARCH-01 disposition |
|-----------|-------------------|---------------------|
| Immediate verifier fan-in before persistence | § Production execution contract (2026-10-11) steps 2–3 | **Deferred** for ARCH-01 path; verifier may remain on **legacy** `study-reader/1` qualification until retired |
| Single canonical consolidation in same pipeline pass | § Production execution contract step 3 | **Deferred** to post–Inspector phase |
| Persona projections in same pipeline pass | § Production execution contract steps 4–5 | **Deferred** |
| “All non-pack engineering parked until IEP pack approved” | §9 (2026-10-11) | **Superseded for extraction architecture planning**; IEP pack **content** review continues on its own scope; extraction-path **implementation** requires ARCH-02+ (or other explicit tickets), not ARCH-01 alone |
| T3.9 case_wide vs parallel_document as primary product fork | [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md) / qualification | **Superseded for production target** (ARCH-01): **pack_driven parallel per logical document** is the default; case_wide experiment remains historical |
| Mandatory TS verifier on hot path before inspection | T3.4–T3.5 behavior | **Not ARCH-01 hot path**; may remain for legacy grading until raw persistence + Inspector qualify |
| §8 “Current active scope: review/redefine IEP Domain Pack **only**; no code edits” | §8 (2026-10-11) | **Superseded for extraction implementation sequencing** only; **IEP pack review scope unchanged**; **ARCH-01 itself is documentation only**; code/env/deploy still require per-ticket approval |

---

## Production execution contract (2026-10-11, amended)

**Phase A (ARCH-01 target):** parallel per-document extraction + raw persistence + Inspector.
**Phase B (deferred):** verification fan-in, consolidation, persona projections, insight checks, meaning, screens — as in the table below.

Per-file extraction is logically isolated but **parallel**, not sequential by default.

1. **Intake → parallel fan-out:** Each logical document is dispatched independently. Each Reader call receives **only that document's pages** as evidentiary input, plus case manifest metadata and the document checklist from the versioned Domain Pack. Bounded concurrency (default **8**), retries, per-document terminal status.
2. **Raw capture (ARCH-01):** Persist original model output and diagnostics **before** semantic acceptance. *(Supersedes immediate verification as a gate to persistence.)*
3. **Verification and fan-in (deferred):** Quote/page validation, type/modality checks, entity linking — after Phase A qualification.
4. **Single canonical consolidation (deferred):** One canonical case truth from immutable verified facts.
5. **Domain Pack personas → downstream projections (deferred):** Customer/Pro views from validated canonical facts only.
6. **Production-like qualification:** L001 and other gates should eventually use Worker → hive-agents **pack_driven** path with raw persistence + Inspector; standalone harnesses remain for unit debug only.
7. **Legacy OpenAI v4 study:** Unchanged on worker `MODEL_*` until explicitly replaced by processing mode flags.

**Convergence unchanged:** Domain Pack defines data and personas; Hive Core orchestrates parallelism and domain-neutral primitives. No IEP-specific Core branches.

---

## 1. Non-negotiable boundary

**One engine, many declarative domain packs.** Hive Core must classify sources, prepare pages, orchestrate extraction, verify (when in Phase B), resolve, combine, check, and render without `if (domain === "iep")` or pack-defined executable callbacks.

**One document per model extraction call by default, with parallel execution.** Case-level reasoning in code comes **after** verified facts exist (Phase B).

**Model proposes; code disposes.** For **validated reports**: no chip → no claim; no validated claim → no factual representation. The **Inspector** is exempt: it shows unvalidated model output by design.

---

## 2. End-to-end pipeline (full v2 target — phased)

| Step | Name | Owner | ARCH-01 phase | Input | Output / hard gate |
|---|---|---|---|---|---|
| 1 | Intake + Engine 1 prep | Code/user | **A** | Uploads, intent, pack | Case, sources, pages, structure map, logical documents |
| 2 | Classify + extract (parallel per document) | Model; pack declares schema | **A** | Compiled pack, manifest, one document's pages | Structured JSON + uncertainties + model provenance |
| 2b | Raw persistence | Code | **A** | Model response + diagnostics | Immutable envelope per document/attempt |
| 2c | Extraction Inspector | Code/UI | **A** | Stored envelopes | Human review of unvalidated extractions |
| 3 | Verify per document | Code | **B** | Candidates, page model, pack metadata | Verified locators; unresolved retained |
| 4 | Consolidate / resolve / compose | Code | **B** | Verified facts, lineage | Operative views, change, conflicts |
| 5 | Insight checks | Code | **B** | Case view + pack rules | Neutral questions |
| 6 | Meaning | Model; code validates | **B** | Verified facts, audience | Plain language, validated IDs only |
| 7 | Screens & export | Code | **B** | Validated facts/meaning | Customer/Pro projections |

Model calls in steps 2 and 6 (step 6 deferred). Classification is embedded in pack-driven extraction JSON (`documentTypeId`).

---

## 3. Domain Pack contract — approved target vs repo today

### Approved target (Decision 2) — four minimal sections

| § | Section | Consumed by (target) |
|---|---------|----------------------|
| 1 | **Domain Schema** | Normalizer field/value maps; Reasoner entity templates; Validator value shapes |
| 2 | **Document Profiles** | Discover recognition; Reader extraction profile per identified document type |
| 3 | **Relationships and Constraints** | Reasoner relationship proposals; Validator endpoint and temporal semantics |
| 4 | **Personas** | Writer report structure; Application entitlement ids; projection emphasis |

**Generic pack:** fallback only when no compatible specialized pack or unknown domain (**DP-02**). **IEP v0.2.1** migration from legacy pack shapes is **DP-01 / DP-02** scope — not silently assumed complete.

### Repo today (runtime / in-flight — not Decision 2 alone)

| Surface | Role today | Target disposition |
|---------|------------|-------------------|
| `@hiveforyou/domain-packs` registry + IEP TS pack | Discover vocabulary, study agents, projections | **DP-01** audit → **DP-02** schema-first contract + compilers |
| `engine/domain-packs/packs-v2/` proposal YAML | Alternate declarative experiments | **No parallel authority** without migration plan (**Decision 2**) |
| `engine/domain-pack/src/pack-driven-reader/` | Reader compile from proposal JSON | Becomes explicit **Reader** contract under **DP-03** |
| `engine/domain-packs/registry/declarative/` | Normalizer + reasoner context compile (local) | **DP-03** / **DP-04** qualify against four-section contract |
| `study-agents/1` export | Legacy reader prompt slice | Retained until **DP-02** maps personas/agents to §4 |

**Fact definition once; document profiles reference schema fields.** Field provenance in extraction: `quoted`, `derived`, `classified`. **Do not send golden answers or synthetic entity IDs in extraction prompts.**

**Historical v2.0 “nine logical sections”** remain in earlier architecture drafts; **v1.4 supersedes the target shape** with the four sections above. Nine-section prose is **not deleted** from [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md) / historical notes.

---

## Domain Pack execution contracts (by stage) — approved target

Each row is the **contract Hive must implement** (tickets **DP-03**, **DP-04**, **CS-vNext-E/F**). **Compliance record:** per-run artifact metadata listing pack pin, stage id, schema version, pass/fail, and unresolved codes (exact storage TBD in **CS-vNext-F**).

| Stage | Pack definitions requested | Model input vs code-enforced | Processing owner | Versioned output | Deterministic compliance checks | Failure / unresolved |
|-------|---------------------------|------------------------------|------------------|------------------|-----------------------------------|---------------------|
| **Discover** | §2 Document Profiles (recognition vocabulary, document types) | Model: recognition proposals from pages/metadata. Code: schema, pack pin, domain routing, structure map integrity | Hive Core orchestration + Discover engine | Discover artifact (existing contracts + pack compliance extension in **DP-03**) | Valid JSON; allowed types; no invented documents; pin match | Unclassified / ambiguous types retained; fail on pin/digest mismatch |
| **Reader** | §2 profile for **identified** document type | Model: extract **source-supported** facts only. Code: pages, manifest, output schema, pin, concurrency | hive-agents / Reader service | `study-reader/1`, `hive.reader-document-extraction/1`, and/or raw extraction envelope per ARCH-01 | Parse schema; document scope; **expected-but-unobserved fields must not become invented facts** | Partial per-document failure; malformed stored with diagnostics; pin fail-closed |
| **Observation Normalizer** | §1 Domain Schema field/value mappings | Code-only: wire fact → observation rows. Model: none | Hive Core | `hive.observation-snapshot/1` | Deterministic ids; evidence quarantine; digest stability; schema validate | Quarantine invalid provenance; never drop raw reader evidence upstream (**DP-03**) |
| **Canonical Reasoner** | §1 entities + §3 relationships (incl. **`observableTypes[]` catalog — gap until DP-04**) | Model: graph delta proposal. Code: observation snapshot, compiled pack context, strict JSON schema, pins | Hive Core reasoner port | `canonical-study-reasoner-proposal/1` | JSON schema + observation-id refs (**Phase D local**); semantic acceptance deferred to Validator | Malformed proposal fail-closed; no accepted graph without **CS-vNext-E** |
| **Graph Validator** | §1 value shapes + §3 relationship/constraint rules | Code-only on proposal + observations + pack rules | Hive Core | `canonical-study-graph-validation/1`, `hive.canonical-study-graph/1` | Evidence rules; referential integrity; unresolved partition; **no chip → no claim** projection gates | Reject invalid; preserve unresolved; never silent merge |
| **Writer** | §4 Personas + accepted graph | Model: **`hive-ui-tree/1`** presentation only. Code: accepted graph, report deterministic body | Hive Core + Writer service | `hive-ui-tree/1`, `canonical-study-report/1` | UI tree refs resolve; no factual mutation | Invalid tree fail-closed; fallback deterministic views |
| **Application** | §4 entitlement identifiers | Code-only server enforcement | App API + Core policy | HTTP 402/403 + audit log (exact contract **CS-vNext-F**) | Entitlement vs persona id; no client-side unlock truth | Fail closed; no canonical mutation on unlock |

**Production today:** Discover/Reader/Normalizer/Reasoner/Validator/Writer **do not** yet emit the full compliance matrix above; OpenAI v4 study bypasses the graph pipeline entirely.

---

## 4. Universal deterministic primitives

Unchanged. Applied in **Phase B** consolidation, not in ARCH-01 extraction persistence.

---

## 5. Prompt and output contract

Stable prefix: universal instructions (`hive-pack-driven-reader/0.2.0`) + compiled pack + case manifest. Per-request user content: single-document pages.

Output schema version: `hive.pack-driven-reader-extraction/0.2.0` (see `output-schema.ts`).

Prompt caching: stable pack + manifest; benchmark before production breakpoint policy.

---

## 6. IEP pack v0.2: review boundaries

**Separate authorized scope from ARCH-01.** IEP Domain Pack review (inventory, typed contract, facts, checklists, requirements) continues in parallel; it does **not** authorize Hive Core domain branches or production Reader changes. ARCH-01 documents how a **compiled pack** feeds the Reader; pack **content** quality remains a pack review outcome. Pack-driven Reader uses **proposal** JSON path until registered pack snapshot wiring is approved under its own ticket(s).

---

## 7. Verification and evaluation

ARCH-01 separates:

1. **Extraction capture fidelity** — raw stored, parse diagnostics accurate, partial failure behavior.
2. **Legacy golden grading** — verifier-accepted facts (`reader-accepted-facts/1`, T3.9 experiments) — not the ARCH-01 success metric.

Golden examples remain evaluation data only.

---

## 8. Scope, sequence and acceptance (updated 2026-10-12)

**ARCH-01 (this ticket):** document approved extraction architecture — **documentation only**. Success means this file and [AGENTIC-PLAN.md](./AGENTIC-PLAN.md) accurately record the target path, config inventory, and deferred work. **Does not** authorize implementation, deployment, or model spend.

**Hive Core:** must remain **domain-agnostic** in all ARCH-01-described phases; domain vocabulary, checklists, and extraction JSON schema live in Domain Packs and the pack compiler.

**Next implementation tickets (parked — each requires explicit approval; not authorized by ARCH-01):**

| Ticket | Summary |
|--------|---------|
| ARCH-02 | Raw persistence envelope (Postgres and/or object storage) + APIs |
| ARCH-03 | Reader path: disable pre-persistence verifier/normalization when `processingMode` is pack-driven ARCH-01 |
| ARCH-04 | Extraction Inspector UI + auth |
| ARCH-05 | Phase B: consolidation + canonical intelligence re-wire |
| ARCH-06 | Reader env simplification + flag retirement (see § Configuration) |

IEP pack review sequence (inventory → typed contract → facts → checklists → requirements) remains required for pack **content** quality.

**Portability acceptance:** unchanged — second domain pack validates against same compiler and Core orchestration.

---

## 9. Configuration ownership and simplification

### Separation of concerns

| Layer | Owns | Examples |
|-------|------|----------|
| **Secrets / infrastructure** | Deploy secrets, URLs, tokens, API keys | `HIVE_ANTHROPIC_API_KEY`, `HIVE_AGENTS_SERVICE_TOKEN`, `HIVE_VERIFIER_TOKEN`, `HIVE_AGENT_TRACE_TOKEN`, Supabase keys, `HIVE_AGENTS_HOST/PORT`, verifier/trace URLs |
| **Version-controlled model & concurrency** | Committed defaults + image config | `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_MAX_OUTPUT_TOKENS`, `READER_PARALLEL_CONCURRENCY` (default 8) |
| **Domain pack configuration** | Pack JSON path or registry resolution | `HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON` (today); future: pack id/version from case context only |
| **Request-scoped execution** | Study run / API body | `readerMode: pack_driven`, `processingMode: pack_driven_v1` vs `canonical_openai_v4`, `studyRunId`, `attemptId`, `engine1ReaderContextJson` |

Worker **OpenAI v4** study uses `MODEL_*` on hive-worker (`deploy/oracle/worker.config.env`). hive-agents Reader uses **separate** `MODEL_*` in `deploy/oracle/agents.config.env`. Do not conflate.

### Inventory — Reader-related environment variables (repo today)

**hive-agents (`agents/src/hive_agents/settings.py`, `HIVE_` prefix unless noted):**

| Variable | Purpose | ARCH-01 target |
|----------|---------|----------------|
| `HIVE_ANTHROPIC_API_KEY` | Anthropic credential | **Keep** (secret) |
| `HIVE_ANTHROPIC_WORKSPACE_ID` | Workspace routing | **Keep** (infra) |
| `HIVE_AGENTS_SERVICE_TOKEN` | Bearer for `POST /study/reader` | **Keep** (secret) |
| `HIVE_AGENTS_JSON` | Legacy study-agents export path | **Keep until** pack snapshot fully replaces; then optional |
| `MODEL_PROVIDER` / `MODEL_NAME` / `MODEL_MAX_OUTPUT_TOKENS` | Reader LM | **Keep** (version-controlled defaults + env override) |
| `HIVE_AGENTS_ALLOW_NONPERSISTENT_AUDIT` | Local opt-out of trace persistence | **Keep** (dev only; forbidden in prod) |
| `HIVE_READER_MODE` | `pack_driven` selector | **Keep** (request-scoped mirror; may collapse into processing mode only) |
| `HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON` | IEP proposal pack path | **Keep** (pack config) until registry wiring |
| `HIVE_PACK_DRIVEN_READER_COMPILER_JS` | Node compiler bridge path | **Keep** (infra/dev override) |
| `HIVE_READER_PARALLEL_CONCURRENCY` | Parallel document calls (default 8) | **Keep** |
| `HIVE_READER_ARCHITECTURE_VARIANT` | `case_wide` \| `parallel_document` experiment | **Target retire** after ARCH-03; production = parallel pack_driven only |
| `HIVE_READER_PARALLEL_PROMPT_VARIANT` | e.g. `p6` experiment | **Target retire** with experiment flags |
| `HIVE_READER_EXPERIMENT_VARIANT` | Retired (error if set) | **Delete** when cleaning env templates |
| `HIVE_READER_EXPERIMENT_TRUNCATE_VERIFICATION` | Experiment only | **Target retire** |
| `HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON` | Oracle boot-check for experiment prompts | **Target retire** from production worker when experiments end |
| `HIVE_READER_EXPERIMENT_ALLOW_LIVE` | Eval CLI gate | **Keep** in eval tooling only |

**Worker / qualification (`engine/core/.../agentic-reader-qualification.ts`, `worker/.env`):**

| Variable | Purpose | ARCH-01 target |
|----------|---------|----------------|
| `HIVE_AGENTS_CONFIG_MODEL_*` | Expected model metadata for qualification | **Simplify** to single source of truth with agents container |
| `HIVE_AGENTS_DOCKER_COMPOSE_MODEL_*` | Compose drift check | **Simplify** |
| `HIVE_AGENTS_MODEL_*` | Effective model check | **Simplify** |
| `HIVE_L001_QUALIFICATION_MANIFEST_JSON` | L001 SHA pins in image | **Keep** for qualification until ARCH-05 gating changes |
| `HIVE_DOCUMENT_PAGES_BUCKET` | Trusted pages storage | **Keep** (shared infra) |
| `HIVE_AGENT_TRACE_*` / `HIVE_VERIFIER_*` | Trace ingest + verifier | **Keep** for legacy paths; optional on ARCH-01 raw-only path |
| `HIVE_CANONICAL_STUDY_*` / `MODEL_*` (worker) | OpenAI v4 study | **Preserve** (legacy production) |

**Request / wire (not env):** `engine1ReaderContextJson`, `documents[]`, `studyRunId`, `attemptId`, `readerMode`.

Proposed **target** Reader surface at runtime: secrets + `MODEL_*` + `READER_PARALLEL_CONCURRENCY` + pack path (interim) + processing mode on study queue — **five groups**, not per-experiment SHA and architecture variant envs.

---

## Three-Contract Boundary: Canonical Study → Report Projection → UI Tree

HiveForYou keeps **three independent, versioned contracts** on the path from canonical intelligence to rendered Customer/Pro reports:

1. **`hive.canonical-study-graph/1`** (target; Decision 1) — authoritative accepted graph: observables, observations (by reference/immutability), resolutions, relationships, conflicts, chronology, unresolved, provenance. **Runtime today:** validated **`case-intelligence/3`** snapshot serves a similar product role but is **not** the v1.4 graph contract.
2. **`canonical-study-report/1`** — deterministic, validated, audience-specific **factual projections** derived from the artifact (Customer body vs Pro body).
3. **`hive-ui-tree/1`** — component selection, layout, ordering, and presentation only. Elements reference report/artifact data **by id** (`claimRef`, `relationId`, `sectionId`, `seriesId`, etc.). Factual text, quotes, and measurements are **never** copied into UI-tree props.

Invariants:

- UI-tree regeneration and validation **must not** invoke document extraction or canonical-study execution.
- Invalid UI-tree or Writer output **fails closed**; the app falls back to deterministic React report views without altering canonical claims.
- The Writer (when introduced) may propose presentation structure only; it cannot create, alter, or delete canonical claims.
- Hive Core and the UI-tree component registry remain **domain-agnostic**; domain terminology and rules live in Domain Packs.
- The rendering library (`@json-render/react` today) is an implementation detail; these three contracts stay independent of any specific renderer.

---

## 10. Open issues and unresolved decisions

**Pack review (carry-forward):**

- **DP-02:** Typed migration from legacy `DomainPack`, IEP v0.2.1, and `packs-v2` proposal into the **four-section schema-first** contract without a redundant parallel format.
- **`observableTypes[]` catalog** in declarative pack for Reasoner context (**DP-04**; local compiler derives endpoints from relationship `from`/`to` until catalog exists).
- Amendment/subtype checklist inheritance.
- Identity keys for goals/services/people without stable ids.
- Image/table locators beyond verbatim quotes.

**ARCH-01 — requires approval before implementation:**

- Storage backend for `hive.reader-document-extraction/1`: Postgres JSONB table vs private bucket vs hybrid (raw bytes in object storage, index in Postgres).
- Retention, PII, and encryption policy for raw model bodies (may contain quoted PHI from documents).
- Whether `attemptId` is UUID per fan-out batch or per-document retry sub-attempt.
- Inspector authorization model (case owner only vs Pro role).
- Flag strategy: `processingMode: pack_driven_v1` vs new `pack_driven_raw_v1` for ARCH-01 path while production Inngest still calls verifier + `reader-accepted-facts`.
- Exact moment to retire DSPy tool-loop Reader vs single-shot pack-driven LM extract (current pack_driven uses `call_pack_driven_extraction`).
- Consolidation ticket ordering relative to IEP pack v0.3 certification.

**Historical plan documents (recovered — preserve unchanged):**

- **[REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md)** — v1.1-era repo map; **historical reference only**. Paths may differ from today’s `engine/` layout; do not treat as live navigation without cross-checking [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md) against [brain/INDEX.md](../INDEX.md) and [architecture/overview.md](../architecture/overview.md).
- **[AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md)** — frozen approved v1.1 plan. **[AGENTIC-PLAN.md](./AGENTIC-PLAN.md) v1.2** is the **ARCH-01 amendment layer**; superseded *decisions* are listed in [§ Superseded or deferred provisions](#superseded-or-deferred-provisions-do-not-delete--architectural-history), not by editing v1.1.

---

## Appendix — Current runtime contracts (reference for implementers)

| Component | Contract |
|-----------|----------|
| Worker env | `worker/src/env.ts` |
| Study reader HTTP | `POST /study/reader`, `study-reader/1` — `agents/src/hive_agents/api_models.py` |
| Pack-driven run | `agents/src/hive_agents/pack_driven_reader/run.py` |
| Pack compile + schema | `engine/domain-pack/src/pack-driven-reader/` |
| Engine 1 reader context | `worker/src/study/engine1-reader-context.ts` |
| Trace events | `hive.agent_run_trace_events` migration `20261009120000_agent_run_trace_events.sql` |
| Accepted facts artifact | `@hiveforyou/shared/reader-accepted-facts` (`reader-accepted-facts/1`) |
| Production reader step | `worker/src/inngest/functions/hive-study.ts` → `run-production-pack-driven-reader.ts` |

*End of proposed architecture document.*
