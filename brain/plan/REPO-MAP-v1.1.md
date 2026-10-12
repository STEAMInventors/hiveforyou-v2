# Hive Agentic Plan v1.1: repo map

Checked against `refactor/engine-boundary` at commit `70ba418` (2026-10-07). Companion to `brain/plan/AGENTIC-PLAN.md`; it does not change the plan, it says where each piece of the plan lands in the code.

**Status:** **Exists** = reuse as is · **Tweak** = change existing code · **New** = write from scratch.

About half of what the plan needs already exists. The net-new work is concentrated in four places: the eval package, the DSPy service, the agent instructions in the pack, and the generative UI renderer.

## Phase 0: v4.1 prompt fix, prompt caching, baseline

| Status | Item | Path |
| --- | --- | --- |
| Exists | v4 engine, prompt loader, prompt generator | `engine/core/src/study/openai-engine-v4.ts`, `engine/core/src/prompts/load-canonical-study-prompt.ts`, `engine/core/scripts/generate-prompts.mjs` |
| Exists | Record/replay model calls | `engine/core/scripts/shadow-golden/recording-call-model.ts` |
| Exists | Model metrics wrapper | `wrapCallModelWithMetrics` in `worker/src/study/build-worker-study-deps.ts` |
| Tweak | Prompt version constant (line 38) and v3 fallback (line 122) | `worker/src/study/build-worker-study-deps.ts` |
| Tweak | Prompt version constant (line 2) | `app/src/lib/canonical-study/canonical-study-config.ts` |
| Tweak | Add v4.1 to `VERSION_FILES` | `engine/core/src/prompts/load-canonical-study-prompt.ts` |
| Tweak | Cache markers; cache tokens in `usage` | `engine/model-providers/src/anthropic-call-model.ts` |
| New | `canonical-study-v4.1.md` | `engine/core/prompts/canonical-study/` |
| New | Baseline script | `engine/core/scripts/baseline-study.mjs` |

## Phase 1: golden set and grader

| Status | Item | Path |
| --- | --- | --- |
| Exists | Word-range overlap matching | `engine/core/src/study/shadow/compare-v4.ts`, `engine/core/src/atoms/` |
| Exists | Quote-at-location check | `engine/core/src/study/validate-document-evidence.ts`, `engine/core/src/document/find-consecutive-word-quote.ts` |
| Exists | Page generation for fixtures | `engine/core/scripts/shadow-golden/ensure-document-pages.ts` |
| Exists | L001 and caleb9 corpora | `engine/intake/fixtures/` |
| Tweak | Export `wordRangesOverlap` and `mapV4EvidenceRefToWordRange` if private | `engine/core/src/atoms/` |
| New | `@hiveforyou/eval` package (golden types, grader, CLI, local endpoint) | `engine/eval/` |
| New | Golden JSON for L001–L006, L007 tripwire, injection case | `engine/eval/golden/` |
| New | L002–L006, L007 and injection corpora | `engine/intake/fixtures/` |

## Phase 2: pack → DSPy definition

| Status | Item | Path |
| --- | --- | --- |
| Exists | Pack type with `study` snapshot (vocabulary, focus constructs) | `engine/domain-pack/src/types.ts`, `engine/domain-packs/iep/pack.ts` |
| Exists | Pack registry | `engine/domain-packs/registry` |
| Tweak | Add `study.agents` to the pack type | `engine/domain-pack/src/types.ts` |
| New | IEP agent instructions, starting from v4.1 reading guidance | `engine/domain-packs/iep/study/agents.ts` |
| New | `pnpm pack:export` script writing `agents.json` + snapshot test | `scripts/` |

## Phase 3: DSPy service with Reader

| Status | Item | Path |
| --- | --- | --- |
| Exists | Document pages with word positions, stored per document | `worker/src/intake/document-pages-storage.ts`, `engine/core/src/document/page-model.ts` |
| Exists | Docker deploy for the worker | `deploy/oracle/docker-compose.yml` |
| Tweak | Add the `agents` container | `deploy/oracle/docker-compose.yml` |
| Tweak | Add a localhost-only listener for the verifier (separate from `/api/inngest`) | `worker/src/main.ts` |
| New | Python DSPy service: Reader module, tools, LM setup with caching, `POST /study/reader` | `agents/` |
| New | Agent run trace table | `supabase/migrations/` |

The worker already loads a case's pages; it sends them in the request to the DSPy service, so Python never re-implements the storage paths.

## Phase 4: worker integration (shadow)

| Status | Item | Path |
| --- | --- | --- |
| Exists | Shadow step pattern and storage | `worker/src/study/run-study-shadow-steps.ts`, `shadow_study_artifacts` table |
| Exists | Proposal validation and projections | `engine/core/src/study/validate-proposal-v4.ts`, `engine/core/src/projections/` |
| Exists | Shadow results API and panel | `app/src/app/api/case/[caseId]/shadow-study/`, `app/src/components/case-summary/ShadowFindingsPanel.tsx` |
| Tweak | Add the DSPy step beside `propose`, behind `HIVE_STUDY_ENGINE` | `worker/src/inngest/functions/hive-study.ts` |
| Tweak | Store DSPy shadow output with an engine label | `shadow_study_artifacts` (migration) |
| Tweak | Show DSPy shadow results beside v4 for comparison | `ShadowFindingsPanel.tsx` |

## Phase 5: pack training

| Status | Item | Path |
| --- | --- | --- |
| Exists | Study fingerprint | `engine/core/src/study/fingerprint.ts` |
| Tweak | Include the compiled pack version in the fingerprint | `engine/core/src/study/fingerprint.ts` |
| New | `train.py` (GEPA, Batch API), gate script | `agents/` |
| New | Gated-version registry table and Storage bucket | `supabase/migrations/` |
| New | Version-pinned loading without restart | `agents/` |

## Phase 6: Investigator

| Status | Item | Path |
| --- | --- | --- |
| Exists | Rule primitives (`requirementCoverage`, `seriesContinuity`, `restatement`, `arithmetic`) | `engine/core/src/study/primitives/` |
| Exists | IEP rulebook | `engine/domain-packs/iep/rulebook/` |
| New | Investigator module and its golden expectations | `agents/`, `engine/eval/golden/` |

## Phase 7: full agentic flow and switch

| Status | Item | Path |
| --- | --- | --- |
| Exists | Evidence requirements check | `unmetIepEvidenceRequirements` in `engine/domain-packs/iep/evidence-requirements/completeness.ts` |
| Exists | Evidence Workspace with missing-evidence hints | `app/src/components/intake/` |
| Tweak | One Inngest step per agent call | `worker/src/inngest/functions/hive-study.ts` |
| Tweak | Evidence Workspace renders the Intake agent's screen tree through the Phase 8 page shell | `app/src/components/intake/` |
| New | Intake agent | `agents/` |

## Phase 8: Writer and inverted dual-persona UI (starts after Phase 3)

Runs on v4 validated data, in parallel with Phases 4–7. No fixed pages or tabs: every screen is a tree the agent composes and the worker gates.

| Status | Item | Path |
| --- | --- | --- |
| Exists | Parent screen internals: story, plan cards, timeline, meeting prep, document explainer, status bar | `app/src/components/hive-case/` |
| Exists | Advocate pieces: `buildProViewModel`, `rankViews`, ledger rows, export | `engine/core/src/views/pro/`, `app/src/components/case-summary/` |
| Exists | Evidence drawer, source chips, in-app PDF viewer | `app/src/components/evidence/`, `HiveCaseEvidenceChip.tsx`, `HfyChip.tsx` |
| Exists | Sentence-to-item binding and tone check | `client-writer/2` (`itemIds`), `engine/shared/src/projections/check-tone.ts` |
| Exists | Audience roles per pack; stated audience per case | `engine/domain-packs/iep/vocabulary/audience-roles.ts`, `case_customer_context` |
| Exists | Brand tokens, fonts, state colours | `app/src/styles/hiveforyou.css`, `app/src/app/layout.tsx` |
| Tweak | Break the tab screens into catalog components that take IDs, not values; retire the tab navigation (`HiveCaseLayout`, `hive-case-tokens.ts`) | `app/src/components/hive-case/` |
| Tweak | Break the Pro workspace into catalog components plus the required advocate anchors (evidence ledger, export) | `app/src/components/case-summary/CaseSummaryProView.tsx` |
| Tweak | Add `ui_tree` to the `projection_kind` check | `supabase/migrations/` |
| New | Pack `ui` section: catalog, persona slots, required items, lead rules, advocate anchors | `engine/domain-pack/src/types.ts`, `engine/domain-packs/iep/ui.ts` |
| New | Screen tree schema with catalog and pack versions | `engine/shared/src/projections/` |
| New | Worker UI gate and the code-built fallback tree | `worker/src/` |
| New | User-action events (answer, upload, decision) from the app to the worker, producing the next tree | `app/src/app/api/`, `worker/src/inngest/functions/` |
| New | Writer module and its UI metric (lead rules included) | `agents/`, `engine/eval/` |
| New | Page shell that renders any validated tree, persona-aware, with a component registry | `app/src/components/hive-ui/` |
| New | Persona selection from `case_customer_context` | `app/src/app/study/[studyRunId]/map/` |

## Outside the plan (parked)

Two UI items surfaced during the check. Neither is in Plan v1.0, so they go to `brain/plan/PARKING-LOT.md`, not into the work:

- CSS tokens use `--hfy-*` names; the brand guide's token names are `--cell-blue`, `--honey` and so on.
- Legacy styles remain in `app/src/styles/legacy/` (the Evidence Workspace still uses Geist/IBM Plex per `CURRENT.md`).

## Where to start

Unchanged: **T0.1** (v4.1 prompt fix). The inverted UI (Phase 8) starts once the Phase 3 service exists; the only earlier UI touch is the shadow comparison panel (Phase 4).
