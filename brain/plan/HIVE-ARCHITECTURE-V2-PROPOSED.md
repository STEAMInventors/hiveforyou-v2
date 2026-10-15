# HiveForYou — Domain-Agnostic, Pack-Driven Architecture v2.0 (PROPOSED)

Date: 2026-10-11 (base); **ARCH-01 amendment: 2026-10-12**
Scope: Architecture specification; IEP Domain Pack review continues in parallel.
Branch: `refactor/engine-boundary`
Status: **ARCH-01 approves this architecture documentation only.** Runtime behavior is unchanged until separate implementation tickets (ARCH-02+) are explicitly authorized in [NEXT.md](../status/NEXT.md). No runtime migration, code changes, env edits, or new model calls are authorized by ARCH-01 alone.

> **ARCH-01 (2026-10-12)** records the simplified **pack-driven extraction path** (Engine 1 boundaries → parallel Anthropic Reader → per-document raw persistence → temporary Extraction Inspector). Cross-document canonical consolidation and Customer/Pro reports are **explicitly deferred** to a later phase. See [§ ARCH-01](#arch-01--simplified-pack-driven-extraction-path-approved-2026-10-12).
>
> **Authorization boundary:** ARCH-01 is a **documentation** ticket. **Every** implementation ticket (ARCH-02 … ARCH-06, T3.9 deploy/live, pack-driven production migration, etc.) requires **explicit approval** and an updated authorized scope in `NEXT.md`. **IEP Domain Pack v0.2 review** remains a **parallel, pack-scoped** specification effort — not authorization to add domain logic to Hive Core.

**Historical sources (ARCH-01 reconciliation):** Approved Agentic Plan v1.1 and its REPO-MAP are preserved as immutable snapshots — [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md), [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md). The living plan amendment is [AGENTIC-PLAN.md](./AGENTIC-PLAN.md) (**v1.2**); ticket execution and SHA history remain in [NEXT.md](../status/NEXT.md). Completed T3.x Reader work remains historical; ARCH-01 does not retroactively close, reopen, or redeploy those tickets.

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

## 3. Universal Domain Pack contract — nine logical sections

Unchanged from v2.0 base spec. Pack compiler for Reader: `engine/domain-pack/src/pack-driven-reader/` (proposal JSON `engine/domain-packs/packs-v2/` migration target).

**Fact definition once; document checklist references it.** Field provenance: `quoted`, `derived`, `classified`.

**Do not send golden answers or synthetic entity IDs in extraction prompts.**

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

1. **`hive.canonical-study/1`** — canonical facts, identities, relationships, measurements, and provenance (the validated artifact).
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

- Typed schema migration from legacy `DomainPack` to packs-v2 proposal.
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
