# Agentic plan — Hive Reader & qualification

Version: **1.3** (Canonical Study Graph amendment, 2026-10-18); prior **1.2** (ARCH-01, 2026-10-12) preserved below  
Frozen prior version: **[AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md)** — approved Agentic Plan v1.1 (historical snapshot; **do not edit**)  
Branch: `refactor/engine-boundary`  
Authoritative architecture (proposed): [HIVE-ARCHITECTURE-V2-PROPOSED.md](./HIVE-ARCHITECTURE-V2-PROPOSED.md) (**v1.3** for Canonical Study vNext)  
Living repo layout: [REPO-MAP.md](./REPO-MAP.md) · Historical: [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md) (**do not edit**)

> **v1.3 is an explicit amendment, not a silent replacement of v1.2 or v1.1.** This file layers **Canonical Study vNext** (Phases A–H) on top of ARCH-01 and the frozen v1.1 snapshot. For original approved phase structure as of v1.1, use **AGENTIC-PLAN-v1.1.md**. Ticket execution history remains in [brain/status/NEXT.md](../status/NEXT.md) (log section — **do not delete**). Implementation detail remains in [brain/status/CURRENT.md](../status/CURRENT.md).

### Version change record

| Version | Date | Scope | Disposition |
|---------|------|-------|-------------|
| v1.1 | (frozen) | Reader/eval Phases 0–8 | Immutable snapshot [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md) |
| v1.2 | 2026-10-12 | ARCH-01 pack-driven extraction path | **Retained** — extraction/Inspector track; not superseded for raw persistence |
| v1.3 | 2026-10-18 | Canonical Study Graph vNext (Phases A–H) | **Proposed target** — see § Canonical Study vNext; **not production-active** |

---

## Historical sources (ARCH-01 reconciliation)

| Document | Role |
|----------|------|
| [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md) | **Immutable** approved Agentic Plan v1.1 — baseline for T0–T3.x Reader/eval lineage |
| [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md) | **Immutable** REPO-MAP companion from v1.1 era — historical paths only; live navigation: [brain/INDEX.md](../INDEX.md), [architecture/overview.md](../architecture/overview.md) |
| **AGENTIC-PLAN.md (this file, v1.3)** | Living plan index: ARCH-01 + Canonical Study vNext + consolidated ticket table + pointers to NEXT/CURRENT |
| [REPO-MAP.md](./REPO-MAP.md) | Living repo map — Phase B/C implemented modules vs Phase D–H proposed |
| [NEXT.md](../status/NEXT.md) | Authorized scope, ticket statuses, execution log |
| [CURRENT.md](../status/CURRENT.md) | What is implemented in the repo today |

**Do not** merge v1.1 prose into this file in ways that erase the v1.2 amendment. **Do not** invent a replacement for REPO-MAP-v1.1.md.

---

## Canonical Study vNext (v1.3 — PROPOSED)

**Architecture version:** [HIVE-ARCHITECTURE-V2-PROPOSED.md](./HIVE-ARCHITECTURE-V2-PROPOSED.md) **v1.3**  
**Production:** unchanged until **Phase H** approval. OpenAI v4/v4.1 → `case-intelligence/3` remains the live path.

**Immediate authorized ticket:** [NEXT.md](../status/NEXT.md) — **CS-vNext-C.1 complete locally (2026-10-18)**. Phase C evidence-integrity review **closed**. **Phase D+ implementation blocked** until explicit user approval.

### Phase status summary

| Phase | Name | Status | Approval to implement next phase |
|-------|------|--------|----------------------------------|
| **A** | Architecture review (v1.3 amendment) | **Complete (documentation — 2026-10-18)** | N/A |
| **B** | Canonical Graph contracts | **Implemented locally** (uncommitted workstream); verification caveats documented | Phase C review |
| **C** | Observation Normalizer | **Implemented locally**; **evidence-integrity review complete (2026-10-18)** | Phase D requires explicit NEXT authorization |
| **C.1** | Generic period wire mapping (`claimValueFromWire`) | **Complete locally (2026-10-18)** | N/A |
| **D** | Canonical Reasoner | **Not started** (port + orchestration) | Explicit NEXT authorization |
| **E** | Graph Validator | **Not started** (accept partition + persistence) | After Phase D scaffold |
| **F** | Production persistence, orchestration, Canonical Study UI, Writer graph adapter, entitlement | **Not started** | After Phases D–E |
| **G** | L001 semantic qualification + non-IEP portability | **Not started** | After Phase F wiring |
| **H** | Production activation + rollback | **Not started** | Explicit go/no-go |

### Phase definitions

#### Phase A — Architecture review

| Field | Value |
|-------|--------|
| **Dependencies** | None |
| **Deliverables** | v1.3 amendment in `HIVE-ARCHITECTURE-V2-PROPOSED.md`; v1.3 plan in this file; `NEXT.md` tracker; `REPO-MAP.md` |
| **Acceptance criteria** | Pipeline, contracts, consolidation deltas, and production-boundary language documented; no claim of production activation |
| **Test evidence** | Documentation review only |
| **Status** | **Complete (2026-10-18)** |
| **Approval** | User review of amendment diff (this task) |

#### Phase B — Canonical Graph contracts

| Field | Value |
|-------|--------|
| **Dependencies** | Phase A |
| **Deliverables** | `@hiveforyou/shared/canonical-study-graph` — types, JSON schema, `validate*`, reasoner port, artifact paths, contract tests |
| **Acceptance criteria** | `pnpm --filter @hiveforyou/shared exec vitest run src/canonical-study-graph/contract.test.ts` passes; schemas versioned; accepted graph distinguished from projections |
| **Test evidence** | **6/6** contract tests passed (2026-10-18, local). **`pnpm --filter @hiveforyou/shared typecheck`** fails on **pre-existing** unrelated errors: `case-intelligence/3/contract.test.ts` (`claimType` on `ProposedClaim`); `projections/check-tone.test.ts` (arity mismatch) — **not introduced by canonical-study-graph**; full package typecheck remains a Phase C/F gate |
| **Status** | **Implemented locally**; not wired to production orchestration |
| **Approval** | Phase C evidence review; no Phase D until closed |

#### Phase C — Observation Normalizer

| Field | Value |
|-------|--------|
| **Dependencies** | Phase B contracts; verified `reader-accepted-facts/1`; declarative pack normalizer (`@hiveforyou/domain-packs/declarative`) |
| **Deliverables** | `engine/core/src/study/observations/` — wire parsing, quarantine records, `normalizeReaderAcceptedFacts`, unit tests + optional L001 fixture test |
| **Acceptance criteria** | Deterministic observation ids; invalid provenance quarantined; verified-only facts accepted; snapshot validates against `hive.observation-snapshot/1`; **L001 qualification artifact: two period quarantines root-caused and cleared in C.1**; accepted-facts provenance semantics documented |
| **Test evidence** | **2026-10-18:** L001 qualification `621870eb-10e6-4b6d-af6a-3e2447e3d357` — **100** facts in, **100** accepted after C.1 (**0** quarantines); pre-C.1 **98** + **2**× `INVALID_VALUE` for `kind: "period"`. Core observation tests **11/11**; `@hiveforyou/shared` canonical-study-graph **6/6**; declarative pack normalizer **2/2**. Shared package typecheck: pre-existing unrelated errors unchanged (Phase B). |
| **Status** | **Implemented locally**; **evidence-integrity review complete**; **C.1 complete** |
| **Approval** | Phase D requires explicit NEXT authorization (not granted by C closure) |

#### Phase D — Canonical Reasoner

| Field | Value |
|-------|--------|
| **Dependencies** | Phase C closed; persisted observation snapshot; pack compiled graph context |
| **Deliverables** | Reasoner implementation of `CanonicalStudyReasoner` port; prompt + strict JSON schema; fixture/replay mode; persistence slot for proposal |
| **Acceptance criteria** | Proposals validate as `canonical-study-reasoner-proposal/1`; no persistence of accepted graph without Phase E; replay tests without live model by default |
| **Test evidence** | TBD — unit + recorded fixture |
| **Status** | **Blocked** (Phase C) |
| **Approval** | Explicit NEXT authorization |

#### Phase E — Graph Validator

| Field | Value |
|-------|--------|
| **Dependencies** | Phase D proposal schema stable |
| **Deliverables** | Deterministic validator producing `canonical-study-graph-validation/1` and `hive.canonical-study-graph/1` on success; issue codes aligned with `validator-issue-codes.ts` |
| **Acceptance criteria** | Fail closed on broken provenance; unresolved partition preserved; accepted graph validates; no UI/report consumption of unaccepted proposals |
| **Test evidence** | TBD — validator fixture suite |
| **Status** | **Blocked** (Phase C) |
| **Approval** | Explicit NEXT authorization |

#### Phase F — Production persistence, orchestration, UI, Writer adapter, entitlement

| Field | Value |
|-------|--------|
| **Dependencies** | Phases D–E; Supabase/storage paths; worker Inngest study function |
| **Deliverables** | End-to-end study run writing observation → proposal → validation → accepted graph; **Canonical Study inspection UI**; Writer adapter reading accepted graph only; **one `writerRunId` per generation**; server-side entitlement for designated reports |
| **Acceptance criteria** | Idempotent study runs; immutable prior attempts; separate routes for graph inspection vs Writer preview; entitlement enforced server-side |
| **Test evidence** | Integration tests + manual browser checklist |
| **Status** | **Not started** |
| **Approval** | Explicit NEXT authorization |

#### Phase G — L001 semantic qualification and non-IEP portability

| Field | Value |
|-------|--------|
| **Dependencies** | Phase F wired in qualification/staging environment |
| **Deliverables** | L001 graph-level qualification report; second domain pack smoke (declarative pack only, no Core branches) |
| **Acceptance criteria** | L001 gates documented; portability demonstrates same contracts with different pack pin |
| **Test evidence** | Qualification CLI + golden comparisons (graph-level) |
| **Status** | **Not started** |
| **Approval** | Explicit NEXT authorization |

#### Phase H — Production activation and rollback

| Field | Value |
|-------|--------|
| **Dependencies** | Phase G sign-off; migration/flag plan |
| **Deliverables** | Feature flag or processing mode cutover; rollback runbook; CURRENT.md update |
| **Acceptance criteria** | Rollback restores v4/`/3` path without data loss; activation does not rewrite immutable accepted artifacts |
| **Test evidence** | Staged activation + rollback drill |
| **Status** | **Not started** |
| **Approval** | Explicit go/no-go — **declares production-active** |

### Supersession notes (v1.3 vs v1.2 ARCH-05)

| Item | v1.2 ARCH-05 wording | v1.3 disposition |
|------|----------------------|------------------|
| Phase B consolidation + case intelligence | Single deferred ARCH-05 ticket | **Split** into Phases B–E (contracts → normalizer → reasoner → validator) + Phase F (persistence/UI) |
| ARCH-05 status in v1.2 table | Parked | **Superseded for vNext tracking only** — ARCH-05 row retained for history; execute via CS-vNext phases |

Historical **ARCH-02–ARCH-06** extraction tickets remain in the v1.2 table below; they are **not** marked done unless evidence exists in NEXT/CURRENT.

---

## v1.2 amendment — ARCH-01 (2026-10-12)

**ARCH-01 approves architecture documentation only** ([HIVE-ARCHITECTURE-V2-PROPOSED.md](./HIVE-ARCHITECTURE-V2-PROPOSED.md): simplified pack-driven extraction path, persistence envelope, config inventory, deferred consolidation).

- **Does not authorize** runtime migration, code changes, env template edits, migrations, deployment, or paid model calls.
- **Does not authorize** ARCH-02 … ARCH-06 or any other implementation ticket. Each requires **explicit approval** and an updated [NEXT.md](../status/NEXT.md) authorized scope.
- **Does not** retroactively close, reopen, or redeploy completed T3.x repo work (qualification experiments remain historical).
- **IEP Domain Pack v0.2 review** continues on its **own** specification scope (pack contract, taxonomy, checklists, facts, requirements). ARCH-01 does not fold pack review into Core implementation.
- **Hive Core** remains **domain-agnostic**; IEP vocabulary and extraction schema belong in the Domain Pack and pack compiler, not Core conditionals.

### Current authorized scope (v1.2)

| Ticket | Type | Status |
|--------|------|--------|
| **ARCH-01** | Architecture documentation (pack-driven extraction, config inventory, persistence envelope) | **Done (documentation only — 2026-10-12)** |

### Parked implementation tickets (not authorized by ARCH-01)

Implement only after separate approval and updated `NEXT.md`.

| Ticket | Scope |
|--------|--------|
| **ARCH-02** | Persist `hive.reader-document-extraction/1` per document/attempt (raw model body + diagnostics) |
| **ARCH-03** | Pack-driven Reader: remove pre-persistence verifier/normalization on ARCH-01 path; retire experiment env variants in production templates |
| **ARCH-04** | Temporary authenticated **Extraction Inspector** (unvalidated claims; no canonical consolidation) |
| **ARCH-05** | Phase B: cross-document consolidation, case intelligence, Customer/Pro projections from verified facts |
| **ARCH-06** | Reader env simplification per architecture §9 inventory |

### STOP gates (unchanged)

- **T3.9** live Anthropic / Oracle deploy: **STOP until explicit approval** unless a later ticket explicitly lifts it.
- **T1.5** local grader HTTP: **Done, paused** — do not extend without new authorization.

---

## Historical plan — Phases (v1.1 lineage)

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 0** | Canonical study v4/v4.1 alignment (T0.x), Anthropic prompt caching verification | **Complete** |
| **Phase 1 — eval** | Golden set, grader, eval CLI (T1.x) | **T1.2 closed**; T1.5 paused |
| **Phase 1 — Reader scaffold** | DSPy hive-agents, verifier, trace, qualification (T2.x, T3.1–T3.8) | **Repo complete** per CURRENT |
| **Phase 1 — Reader experiment** | T3.9 architecture A/B (case_wide vs parallel_document) | **Repo P1–P6 Done**; deploy/live **STOP** |
| **Phase 1 — extraction architecture** | ARCH-01 documentation | **Done (documentation only)** |
| **Phase 1 — extraction implementation** | ARCH-02+ | **Paused** pending explicit approval |

---

## Plan amendment — 2026-10-08 (Aryya-authorized)

- **L007 removed** — no source corpus ever existed; do not manufacture L007 to satisfy old numbering.
- **T1.2 core golden set:** L001–L006 (Hive fixtures under `engine/intake/fixtures/`).
- **Additional robustness case:** **iep-e-1** (explicit identity; not renamed to L007).
- **Splits (core):** tune = L001, L002, L003, L005; holdout = L004, L006.
- **Injection fixture:** mandatory safety work before a trained/agentic Reader may pass the later **tripwire/shadow promotion** gate; **not** a T1.2 closure blocker. Target path when built: `engine/eval/golden/tripwire/injection.json` (not present on disk yet). Tripwire directory exists and is empty.

---

## Tickets — consolidated table (from NEXT + CURRENT)

Statuses reflect repo state as of 2026-10-12. **Done** does not re-authorize deploy/live work where STOP gates apply.

| Ticket | Scope | Status |
|--------|-------|--------|
| ARCH-01 | Document simplified pack-driven extraction path (Engine 1 → parallel Reader → raw persistence → Inspector; config inventory; deferred consolidation) | **Done (documentation only)** |
| ARCH-02 | Raw extraction persistence envelope + APIs | Parked |
| ARCH-03 | Reader path without pre-persistence verifier/normalization; retire experiment envs in prod templates | Parked |
| ARCH-04 | Temporary Extraction Inspector | Parked |
| ARCH-05 | Phase B consolidation + canonical intelligence + projections | Parked |
| ARCH-06 | Reader env simplification | Parked |
| T0.1 | canonical-study **v4.1** prompt/schema alignment with `canonical-study-proposal/4`; route v4.1 through v4 validation/runtime (`isV4PromptVersion`) | Ready for review |
| T0.2 | Baseline capture: L001 + caleb9 under v4 and v4.1, recorded model calls, no scoring | Done |
| T0.3 | Prompt caching in Anthropic provider; cache system prompt + document attachments and record cache read/write tokens | Done |
| T1.1 | `@hiveforyou/eval` package scaffold (`engine/eval`); workspace registration; typecheck/vitest only | Done (e6cc87c) |
| T1.2 | Core set L001–L006 certified GoldenCases + iep-e-1 robustness; schema, fixtures, review packages, anchor validation | **Done** |
| T1.3 | Grader logic | Done |
| T1.4 | Eval CLI / local grader endpoint | Done |
| T1.5 | Local grader HTTP endpoint (`serve-grader.ts`); Bearer token; POST `/eval/grade` | Done (paused — do not extend) |
| T2.3 | Study agents export — `pnpm pack:export <domainId>` → `study-agents/1` JSON under `engine/domain-packs/<domainId>/study/agents.json` | Done (see CURRENT) |
| T3.1 | Python DSPy service scaffold under `agents/` (`hive_agents`, FastAPI `/health`, pack loader) | Done (see CURRENT) |
| T3.2 | DSPy LM config — Anthropic env, `configure_dspy_lm`, lm15 cache helpers, usage normalization | Done (see CURRENT) |
| T3.3 | DSPy Reader module — pack reader, tools, candidate facts only | Done (see CURRENT) |
| T3.4 | Reader → TS verifier — localhost worker, Python verifier client | Done (see CURRENT) |
| T3.5 | `POST /study/reader` — service token, mandatory verifier, `study-reader/1` | Done (see CURRENT) |
| T3.6 | Persistent Reader run audit — `hive.agent_run_trace_events`, trace ingest | Done (see CURRENT) |
| T3.7 | Reproducible Python deps + Oracle Docker for hive-agents | Done (see CURRENT) |
| T3.8 | DSPy handoff, Reader normalization, L001 document identity, agentic qualification path | Done (see CURRENT) |
| T3.9 | L001 Reader architecture A/B (case_wide vs parallel_document); golden v4.1 prompt; Engine 1 context; dedup + timing; golden 117-fact grade; dry-run + cost estimate | **Done** (repo P1–P6); deploy/live Anthropic **STOP until approval** |

### T1.2 closure rule (amended)

T1.2 may be marked **Done** when:

- A. L001–L006 are all **certified** GoldenCases (`engine/eval/golden/<split>/<caseId>.json`)
- B. each has non-empty `verifiedBy`
- C. each has `draft: false`
- D. all primary fact anchors validate against committed `document-pages`
- E. tune/holdout splits match the table above
- F. `@hiveforyou/eval` typecheck and tests pass

**iep-e-1:** additional robustness coverage — certify when corpus + document-pages exist in repo; until then remain verified external review material only.

**Injection:** deferred mandatory safety gate (see plan amendment); does not block T1.2 Done.

### T1.2 core golden set (closed 2026-10-08)

**Tune:** L001, L002, L003, L005  
**Holdout:** L004, L006  

All six verified by **Aryya Bhattacharyya**, `draft: false`, all primary anchors valid against committed `document-pages`. **782** GoldenFacts total.

| Case | Split | Path | Facts | Gaps | Tripwires | Primary anchors |
|------|-------|------|-------|------|-----------|-----------------|
| L001 | tune | `engine/eval/golden/tune/l001.json` | 117 | 1 | 4 | 117/117 |
| L002 | tune | `engine/eval/golden/tune/l002.json` | 173 | 1 | 7 | 173/173 |
| L003 | tune | `engine/eval/golden/tune/l003.json` | 86 | 1 | 11 | 86/86 |
| L004 | holdout | `engine/eval/golden/holdout/l004.json` | 80 | 1 | 9 | 80/80 |
| L005 | tune | `engine/eval/golden/tune/l005.json` | 123 | 1 | 12 | 123/123 |
| L006 | holdout | `engine/eval/golden/holdout/l006.json` | 203 | 1 | 15 | 203/203 |

**iep-e-1:** additional verified robustness material (`engine/eval/golden/_review/iep-e-1/`); not required for core T1.2 closure (no in-repo corpus).

**L007:** removed — no source corpus; not fabricated.

**Injection fixture:** mandatory before later tripwire/shadow promotion; not a T1.2 blocker.

Review packages: `engine/eval/golden/_review/<case>/` with `*-golden.v4.json`, `*-golden.evidence-index.json`, `*-golden.REVIEW.md`, `build_*_golden.py`.

---

## Decisions superseded by ARCH-01 (v1.2 — see architecture doc)

These amend **production extraction target** only; they do **not** rewrite v1.1 ticket completion history.

| v1.1 / experiment era | ARCH-01 v1.2 disposition |
|-----------------------|-------------------------|
| T3.9 **case_wide** vs **parallel_document** as open product fork | **Superseded for production target:** `pack_driven` parallel per logical document ([HIVE-ARCHITECTURE-V2-PROPOSED.md](./HIVE-ARCHITECTURE-V2-PROPOSED.md) § Superseded) |
| Verifier-backed acceptance before human inspection on hot path | **Deferred** on ARCH-01 path; legacy `study-reader/1` + `reader-accepted-facts/1` remain for qualification until ARCH-03+ |
| Immediate canonical consolidation in one pipeline pass | **Deferred** to ARCH-05 / Phase B |

Full table: [HIVE-ARCHITECTURE-V2-PROPOSED.md — Superseded or deferred provisions](./HIVE-ARCHITECTURE-V2-PROPOSED.md#superseded-or-deferred-provisions-do-not-delete--architectural-history).

---

## Relationship to other tracks

| Track | Notes |
|-------|--------|
| **OpenAI canonical study v4/v4.1** | Production worker `MODEL_*`; unchanged by ARCH-01 documentation |
| **T0–T1 eval golden set** | Closed per table above; still valid for Engine 2 proposal grading |
| **T3.9 Reader experiments** | Historical per [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md); ARCH-01 **production target** (when implemented) is **`pack_driven` + parallel per logical document**, not case_wide |
| **IEP Domain Pack v0.2 review** | **Separate authorized scope** — pack content gates quality of compiled Reader prompts; not Hive Core code |
| **V2 Engine 2 slices** | Legacy milestone scope: [NEXT-v2-slices.md](../status/NEXT-v2-slices.md) |

---

## Principles (unchanged)

- Model proposes. Pack defines. Code validates. Professional decides.
- No chip → no claim **on validated Customer/Pro surfaces**; Inspector explicitly shows unvalidated model output.
- Hive Core domain-agnostic; IEP extraction vocabulary and schema live in the Domain Pack.

---

## Execution log (append-only)

Dated SHA notes and ticket completion history: [NEXT.md — Log](../status/NEXT.md#log). Append new rows there; do not truncate prior entries.

Every implementation ticket must cite **architecture version** (e.g. v1.3) and **phase acceptance criteria** from § Canonical Study vNext.

| Date | Arch/plan version | Ticket | Status | Files changed | Tests / results | Commit SHA | Blockers | Approval |
|------|-------------------|--------|--------|---------------|-----------------|------------|----------|----------|
| 2026-10-18 | HIVE-ARCH v1.3 / AGENTIC-PLAN v1.3 | CS-vNext Phase A | Complete (documentation) | `brain/plan/HIVE-ARCHITECTURE-V2-PROPOSED.md`, `brain/plan/AGENTIC-PLAN.md`, `brain/plan/REPO-MAP.md`, `brain/status/NEXT.md` | Doc review; shared contract tests cited in Phase B row | — (no commit per user request) | Phase C evidence closure | **Pending user approval of amendment diff** |
| 2026-10-18 | v1.3 | CS-vNext Phase C | Evidence-integrity review complete | `brain/status/NEXT.md`, `brain/plan/AGENTIC-PLAN.md` | L001 100 facts; 98→100 after period fix; determinism verified | — | Phase D | Blocked pending approval |
| 2026-10-18 | v1.3 | CS-vNext-C.1 | Complete (local) | `engine/core/src/study/observations/wire-fact.ts`, `wire-fact.test.ts`, normalize tests | 11/11 core obs tests; L001 100/100; digest `a31b10186d2ea457b425786e6a4c182e40eb801240570438912af014d81cf10d` | — | None | Phase D not authorized |
