# Agentic plan — Hive Reader & qualification

Version: **1.2** (ARCH-01 architectural amendment, 2026-10-12)  
Frozen prior version: **[AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md)** — approved Agentic Plan v1.1 (historical snapshot; **do not edit**)  
Branch: `refactor/engine-boundary`  
Authoritative extraction architecture (proposed): [HIVE-ARCHITECTURE-V2-PROPOSED.md](./HIVE-ARCHITECTURE-V2-PROPOSED.md)  
Historical repo layout (v1.1 era): [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md) (**do not edit**)

> **ARCH-01 is an explicit amendment, not a silent replacement of v1.1.** This file (**v1.2**) layers ARCH-01 documentation scope and parked ARCH-02–ARCH-06 tickets on top of the frozen v1.1 snapshot. For original approved phase structure and ticket wording as of v1.1, use **AGENTIC-PLAN-v1.1.md**. Ticket execution history, 2026-10-08 golden-set amendments, and dated SHA log remain in [brain/status/NEXT.md](../status/NEXT.md) (log section — **do not delete**). Implementation detail for completed Reader tickets remains in [brain/status/CURRENT.md](../status/CURRENT.md).

---

## Historical sources (ARCH-01 reconciliation)

| Document | Role |
|----------|------|
| [AGENTIC-PLAN-v1.1.md](./AGENTIC-PLAN-v1.1.md) | **Immutable** approved Agentic Plan v1.1 — baseline for T0–T3.x Reader/eval lineage |
| [REPO-MAP-v1.1.md](./REPO-MAP-v1.1.md) | **Immutable** REPO-MAP companion from v1.1 era — historical paths only; live navigation: [brain/INDEX.md](../INDEX.md), [architecture/overview.md](../architecture/overview.md) |
| **AGENTIC-PLAN.md (this file, v1.2)** | Living plan index: ARCH-01 amendment + consolidated ticket table + pointers to NEXT/CURRENT |
| [NEXT.md](../status/NEXT.md) | Authorized scope, ticket statuses, execution log |
| [CURRENT.md](../status/CURRENT.md) | What is implemented in the repo today |

**Do not** merge v1.1 prose into this file in ways that erase the v1.2 amendment. **Do not** invent a replacement for REPO-MAP-v1.1.md.

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

## Execution log

Dated SHA notes and ticket completion history: [NEXT.md — Log](../status/NEXT.md#log). Append new rows there; do not truncate prior entries.
