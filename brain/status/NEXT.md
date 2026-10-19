# NEXT - authorized agentic scope

Branch: **refactor/engine-boundary**. Legacy slice scope: [NEXT-v2-slices.md](NEXT-v2-slices.md).

## Canonical Study vNext (2026-10-18)

**Architecture version:** [HIVE-ARCHITECTURE-V2-PROPOSED.md](../plan/HIVE-ARCHITECTURE-V2-PROPOSED.md) **v1.3** (PROPOSED — not production-active)  
**Plan version:** [AGENTIC-PLAN.md](../plan/AGENTIC-PLAN.md) **v1.3**  
**Repo map:** [REPO-MAP.md](../plan/REPO-MAP.md)

**Current ticket:** **CS-vNext-C.1 — generic period observation support** (**implementation complete locally**; **no commit / no Phase D** without explicit approval).

**Phase C evidence-integrity review:** **Complete (2026-10-18)** — verified against qualification `reader-accepted-facts/1` study run `621870eb-10e6-4b6d-af6a-3e2447e3d357`.

| Check | Requirement | Status |
|-------|-------------|--------|
| L001 accounting | **100** Reader facts in artifact; **100** accepted after C.1 (was **98** + **2** `INVALID_VALUE` quarantines for unsupported `kind: "period"` wire values) | **Complete** |
| Quarantine root cause | `reader-candidate-1b1511d73e8b` (index 71, `iep_period`) and `reader-candidate-6a641f0ddf35` (index 86, `goal_period`) — Reader transport `periodStart` / `periodEnd` not mapped in `claimValueFromWire` | **Complete → fixed in C.1** |
| Provenance semantics | `reader-accepted-facts/1` envelope treats verifier-gated facts as verified; `verificationStatus: "proposed"` on wire facts is **expected** post-verifier acceptance metadata; duplicate reader fact ids remain separate observations when value/evidence differ | **Documented** |
| Determinism | Stable observation ids and `contentDigest` match on repeated normalization (`a31b10186d2ea457b425786e6a4c182e40eb801240570438912af014d81cf10d` after C.1) | **Complete** |
| Shared typecheck | Pre-existing `@hiveforyou/shared` failures (`case-intelligence/3/contract.test.ts`, `projections/check-tone.test.ts`) — **not** introduced by graph contracts or C.1 | **Documented in plan Phase B** |

**Blockers:** None for C.1. **Phase D — Canonical Reasoner** remains **not authorized** until explicit user approval.

### CS-vNext phase tracker (summary)

| Phase | Status |
|-------|--------|
| A — Architecture review | **Complete (2026-10-18, documentation)** |
| B — Graph contracts | **Implemented locally**; shared contract tests 6/6; package typecheck caveats |
| C — Observation Normalizer | **Implemented locally**; **evidence-integrity review complete (2026-10-18)** |
| C.1 — Generic period wire mapping | **Complete locally (2026-10-18)** |
| D–H | **Not authorized** |

Detail: [AGENTIC-PLAN.md § Canonical Study vNext](../plan/AGENTIC-PLAN.md#canonical-study-vnext-v13--proposed).

---

## Historical — ARCH-01 / Reader scope (retained)

**Prior “current ticket” (2026-10-12):** **ARCH-02 complete locally** — **148** Agent tests passed; Worker audit-gate test passed; **five** durability scenarios passed. **Uncommitted; not deployed; production behavior unchanged.** Superseded as *active* ticket by CS-vNext Phase C above; status **not** deleted.

**Parked (not authorized):** ARCH-03 … ARCH-06 implementation tickets listed in [AGENTIC-PLAN.md](../plan/AGENTIC-PLAN.md). ARCH-01 extraction track **parallel** to v1.3 graph target; ARCH-05 consolidation wording **superseded for vNext** by Phases B–F in v1.3 plan — **not** marked done.

**Historical — T3.9:** Reader architecture experiment (case_wide vs parallel_document) — repo P1–P6 **Done**; **STOP** before Oracle deploy or live Anthropic unless explicitly lifted. T1.5 paused — do not extend without new authorization.

**Phase 0:** implementation and live verification complete.

**Phase 1:** extraction architecture specified (ARCH-01); ARCH-02 envelope **verified locally** (uncommitted); **ARCH-03+ paused** pending explicit authorization.

## Plan amendment — 2026-10-08 (superseded for plan location only)

**Authoritative plan file:** [AGENTIC-PLAN.md](../plan/AGENTIC-PLAN.md) (restored v1.2 with ARCH-01). T1.2 scope history remains in this file's log below.

Amendments (Aryya-authorized):

- **L007 removed** — no source corpus ever existed; do not manufacture L007 to satisfy old numbering.
- **T1.2 core golden set:** L001–L006 (Hive fixtures under `engine/intake/fixtures/`).
- **Additional robustness case:** **iep-e-1** (explicit identity; not renamed to L007).
- **Splits (core):** tune = L001, L002, L003, L005; holdout = L004, L006.
- **Injection fixture:** still **mandatory** safety work before a trained/agentic Reader may pass the later **tripwire/shadow promotion** gate; **not** a T1.2 closure blocker. Target path when built: `engine/eval/golden/tripwire/injection.json` (not present on disk yet). Tripwire directory exists and is empty.

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| ARCH-01 | Document simplified pack-driven extraction path (Engine 1 → parallel Reader → raw persistence → Inspector; config inventory; deferred consolidation) | **Done (documentation only)** |
| ARCH-02 | Raw extraction persistence envelope + APIs | **Done (local, 2026-10-12)** — 148 Agent tests; Worker audit-gate; 5 durability scenarios; **uncommitted / not deployed** |
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
| T3.9 | L001 Reader architecture A/B (case_wide vs parallel_document); full golden v4.1 prompt; Engine 1 context; dedup + timing; golden 117-fact grade; dry-run + cost estimate | **Done** (repo P1-P6); deploy/live Anthropic **STOP until approval** |

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

## Log

| Date | Arch/plan | Ticket | Status | Files | Tests / results | SHA | Blockers | Approval |
|------|-----------|--------|--------|-------|-----------------|-----|----------|----------|
| 2026-10-18 | v1.3 | CS-vNext Phase A | Complete (doc) | `HIVE-ARCHITECTURE-V2-PROPOSED.md`, `AGENTIC-PLAN.md`, `REPO-MAP.md`, `NEXT.md` | Phase B: 6/6 `canonical-study-graph/contract.test.ts`; shared typecheck 4 errors (legacy tests) | — | Phase C closure | Pending user review |
| 2026-10-18 | v1.3 | CS-vNext Phase C | **Evidence-integrity review complete** | `brain/status/NEXT.md`, `brain/plan/AGENTIC-PLAN.md` | L001: 100 in → 98 accepted pre-C.1 (2× `INVALID_VALUE` period); determinism + provenance documented | — | Phase D blocked | User approval for Phase D |
| 2026-10-18 | v1.3 | CS-vNext-C.1 | **Complete (local)** | `engine/core/src/study/observations/wire-fact.ts`, tests, L001 qualification re-run | Core obs tests **11/11**; shared graph **6/6**; pack normalizer **2/2**; L001 **100/100** accepted, **0** quarantines | — | None | Phase D not authorized |

| Date | Ticket | SHA | Notes |
|------|--------|-----|-------|
| 2026-10-12 | ARCH-02 | — | **ARCH-02 status closure (documentation only):** Marked complete locally on 2026-10-12. Verification recorded: **148** Agent pytest passed; Worker audit-gate test passed; **five** durability scenarios passed. **Implementation uncommitted, not deployed; production behavior unchanged.** ARCH-03–ARCH-06 remain parked; Canonical Study on consolidation path deferred. No commit, push, or deployment. |
| 2026-10-12 | ARCH-01 | — | **ARCH-01 final historical reconciliation (documentation only):** Reconciled `AGENTIC-PLAN.md` v1.2 as explicit amendment atop frozen `AGENTIC-PLAN-v1.1.md` + `REPO-MAP-v1.1.md`; updated `HIVE-ARCHITECTURE-V2-PROPOSED.md` historical/superseded references; aligned CURRENT/NEXT (ARCH-01 done; ARCH-02–06 parked). No code, SQL, env, deployment, commit, or push. |
| 2026-10-12 | ARCH-01 | — | **ARCH-01 Done (documentation only):** Updated `brain/plan/HIVE-ARCHITECTURE-V2-PROPOSED.md` (ARCH-01 path, superseded provisions, persistence envelope, config inventory, acceptance criteria, open questions); restored `brain/plan/AGENTIC-PLAN.md` v1.2; parked ARCH-02–ARCH-06. No code, env, migration, or model calls. |
| 2026-10-08 | T1.2 | — | **T1.2 Done:** L003/L004/L005 certified after Aryya verification. L004 review package in `_review/l004/`; provenance rebuild 173/173 on `engine/intake/fixtures/l004/` (regenerated v4 + index match reviewed package). Core set 6/6, 782 GoldenFacts, all anchors OK. Eval 47/47; typecheck OK; `git diff --check` OK. iep-e-1 remains robustness-only; injection still mandatory later; no L007; no commit. |
| 2026-10-08 | T1.2 | — | L003/L005 technical review: provenance 194/194 and 208/208 on committed document-pages; counts match REVIEW; conversion mapping ready; REVIEW remains draft. L004: fixture complete; **external review package missing** (empty `_review/l004/`). No certified goldens written. Eval 47/47; typecheck OK. |
| 2026-10-08 | T1.2 | — | Plan amendment: core L001–L006; iep-e-1 robustness; L007 dropped; injection deferred to pre-promotion safety gate. Inventory reconciled on disk; 3/6 core certified; L003/L004/L005 remain blockers. `draft-golden.ts`: removed L007 split mapping. Eval typecheck + 47 tests pass. |
| 2026-10-08 | T1.5 | — | T1.5 complete: localhost-only grader on 127.0.0.1; `HIVE_EVAL_TOKEN` Bearer auth; POST `/eval/grade`; certified golden resolution only; committed corpus via existing loader; grading delegates exclusively to `gradeGoldenProposal`; canonical-study-proposal/4 validation; stable HTTP error responses; Python acceptance client; eval tests 47/47; typecheck passed; `git diff --check` passed; live Python acceptance score 1, all five metrics 1. |
| 2026-10-08 | T1.4 | — | T1.4 complete: baseline eval CLI + reports; v4 mean 0.0577, v4.1 mean 0.1624 (L001/L002 tune); T0.2 baseline replay limitation retained (acceptedClaims only — incomplete missingInformation/conflicts); precision zero-denominator fix; no model calls. |
| 2026-10-08 | T1.4 | — | T1.4 started: eval CLI scores saved T0.2 baselines (acceptedClaims replay) against certified tune goldens; reports under engine/eval/reports/; no model calls. |
| 2026-10-07 | T1.3 | — | T1.3 complete: deterministic golden grader (`grade.ts`); word-range + value fact match, gapKind rules, six failure kinds, tripwire score=0, precision/recall/abstention score; draft goldens refused; 24/24 eval tests. |
| 2026-10-07 | T1.3 | — | T1.3 started: `engine/eval/src/grade.ts` grader (word-range overlap + value, six failure kinds, metrics/score/feedback); certified L001/L002 inputs; T1.2 corpus certification continues in parallel. |
| 2026-10-07 | T1.2 | — | **L002 certified:** IEP tune golden `engine/eval/golden/tune/l002.json`; 173 facts, 1 gap, 7 tripwires; reviewed reference 0 conflicts; `verifiedBy` Aryya Bhattacharyya; all 173 primary anchors validated; longitudinal false-conflict tripwires preserved. |
| 2026-10-07 | T1.2 | — | **iep-e-1 verified (external):** Aryya Bhattacharyya; 32 entities, 185 claims, 0 conflicts, 4 gaps, 249 evidence refs; v4 review package unchanged; OCR/layer-limited facts accepted; GoldenCase conversion / slot pending. |
| 2026-10-07 | T1.2 | — | **L001 certified:** 117 facts, 1 gap, 4 tripwires; `verifiedBy` Aryya Bhattacharyya; all 117 anchors validated. Remaining tune/holdout/tripwire cases not yet verified. |
| 2026-10-07 | T1.2 | — | T1.2 explicitly authorized: golden types, fixture corpora (where source exists), draft-golden seed script; no grader (T1.3). |
| 2026-10-07 | T1.1 | e6cc87c | T1.1 complete: `@hiveforyou/eval` scaffold (`engine/eval`); workspace registration; typecheck/vitest. |
| 2026-10-07 | T1.1 | — | T1.1 complete: `@hiveforyou/eval` scaffold created; workspace registration complete; production dependencies limited to `@hiveforyou/core` and `@hiveforyou/shared`; typecheck passes; Vitest passes with passWithNoTests (scaffold intentionally has no tests yet). |
| 2026-10-07 | T1.1 | — | T1.1 authorized after Phase 0 verification (T0.3 closed at 888e412). |
| 2026-10-07 | T0.3 | 888e412 | Close T0.3 prompt caching verification. |
| 2026-10-07 | T0.3 | 3da2d88 | Anthropic prompt caching verified live on Oracle. Study propose succeeded with provider anthropic / model claude-opus-5-5 and reported cacheReadInputTokens 10854 and cacheWriteInputTokens 1982. T0.3 complete. |
| 2026-10-07 | T0.3 | 73b9244 | Anthropic prompt caching implementation complete; targeted tests 25/25 pass; live cache verification blocked because HIVE_ANTHROPIC_API_KEY is unavailable. Formal exit still requires second identical-prefix call to report cache-read tokens > 0. |
| 2026-10-07 | T0.2 | f44f77e | Baseline capture complete: L001 and caleb9 recorded under v4 and v4.1; four baseline files plus recordings committed; no scoring performed. |
| 2026-10-07 | T0.2 | — | Plan owner explicitly advanced authorized scope to T0.2; unrelated T0.1 global-test blocker (domain-pack boundary) remains parked. |
| 2026-10-07 | T0.1 | ce5f856 | v4.1 prompt/schema alignment and v4 runtime routing implemented; targeted tests pass; formal exit pending repo-wide test/build blockers and worker production verification |
| 2026-10-07 | T0.1 | 548f124 | T0.1 runtime verification passed on Oracle: promptVersion v4.1, engine v4, study load-context succeeded. Formal completion remains blocked only by the unrelated repo-wide domain-pack boundary test. |
