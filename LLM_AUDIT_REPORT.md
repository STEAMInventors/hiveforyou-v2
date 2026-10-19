# LLM Audit Report

Generated: 2026-10-19. Scope: repository-wide discovery for LiteLLM tiered gateway migration.

## Installed AI SDKs (package.json)

| Package | Root | app/ | engine/shared | engine/model-providers | engine/core | engine/intake | packages/intake |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `openai` | — | — | **Added by gateway work** | — | — | — | — |
| `@anthropic-ai/sdk` | — | — | — | **^0.131.0** | — | — | — |
| `@google/generative-ai` | — | — | — | — | — | — | — |
| `langchain` | — | — | — | — | — | — | — |
| `ai` (Vercel AI SDK) | — | — | — | — | — | — | — |

**Summary:** There is no direct `openai` npm dependency in the repo prior to this gateway work. Production model access uses **`@hiveforyou/model-providers`**, which implements OpenAI **Responses API** and Anthropic **Messages API** via **`fetch`**, not the official `openai` SDK. Anthropic is the only vendor SDK installed today.

## Where LLM clients are instantiated

There are **no** `new OpenAI()` or `createOpenAI()` usages in the codebase.

| Layer | File | Mechanism |
| --- | --- | --- |
| Central env factory | `engine/model-providers/src/create-call-model-from-env.ts` | `createOpenAICallModel({ apiKey })` / `createAnthropicCallModel({ apiKey, model, ... })` |
| OpenAI adapter | `engine/model-providers/src/openai-call-model.ts` | `fetch("https://api.openai.com/v1/responses")` and file upload to `/v1/files` |
| Anthropic adapter | `engine/model-providers/src/anthropic-call-model.ts` | `@anthropic-ai/sdk` `Anthropic` client |
| App server wiring | `app/src/lib/model/call-model.server.ts` | `createCallModelFromEnv` from model-providers |
| Worker study wiring | `worker/src/study/build-worker-study-deps.ts`, `worker-call-model.ts` | `tryCreateCallModelFromEnv` / `createCallModelFromEnv` |
| Story writer | `app/src/lib/story/story-writer-call-model.server.ts` | OpenAI path via env bundle |
| Pro case Q&A | `app/src/lib/case-summary/pro-query-service-server.ts` | `callModelFromServerEnv` |
| Experiments | `experiments/pack-driven-reader-l001/src/run-qualification.ts`, `experiments/t3-9-ontology/src/cli.ts` | `createCallModelFromEnv` |
| Pack-driven Reader (production) | `worker/src/study/run-production-pack-driven-reader.ts` | **HTTP** to hive-agents (`ReaderHttpClient`); model provider configured in agent container env (`HIVE_AGENTS_*`) |

**Intake OCR path (`engine/intake`, `packages/intake`):** PDF/native/OCR text recovery only — **no LLM calls**.

## Hardcoded model strings (by task)

| Task / area | Default / fallback models | Config override |
| --- | --- | --- |
| Global study/discover (env factory) | OpenAI: `gpt-5.6-sol`; Anthropic: `claude-opus-5-5` | `MODEL_PROVIDER`, `MODEL_NAME` |
| Discover engines | `gpt-5.6-sol` | `engine/core/src/discover/engine.ts` |
| Canonical study OpenAI v3/v4 | Uses injected `modelName` or `gpt-5.6-sol` | `engine/core/src/study/openai-engine-v3.ts`, `openai-engine-v4.ts` |
| Client summary / writer passes | `gpt-5.6-sol` | `client-summary-pass.ts`, `client-writer-pass.ts` |
| Story writer | `gpt-4o-mini` (`DEFAULT_STORY_WRITER_MODEL`) | `engine/core/src/study/story/generateStory.ts` |
| Canonical reasoner | `claude-opus-5-5` / `gpt-5.6-sol` by provider | `create-canonical-reasoner-from-env.ts` |
| Hive-agents Reader metadata | `claude-opus-5-5` | `HIVE_AGENTS_MODEL_NAME`, compose/container overrides |
| Pack-driven L001 qualification | `claude-opus-5-5` | `MODEL_NAME` |
| T3.9 ontology experiment | `claude-opus-5-5` (Anthropic) | CLI `--provider` |
| Pro query fallback | `gpt-4o-mini` | `pro-query-service-server.ts` |
| Atoms Tier-1 semantic extraction | Uses caller-injected model (same as global env) | **Migrated → harvester tier gateway** |
| Legacy env (warn-only) | Various `HIVE_*_MODEL` | Ignored; see `LEGACY_MODEL_ENV_VAR_NAMES` |

LiteLLM-style model aliases (e.g. `gemini/gemini-1.5-flash`) are **not** used in code today; they are introduced via the new tier env vars on the gateway.

## Primary extraction pipelines

1. **Engine 1 (intake):** `packages/intake` / `engine/intake` — deterministic PDF/OCR → page text. No models.
2. **Phase 0 schema (ad hoc intake):** `engine/intake/src/dynamic-schema-generator.ts` — **rule-based** receipt/generic JSON Schema; no LLM.
3. **Phase 1 document fact extraction (in-repo Tier-1 atoms):** `engine/core/src/atoms/semantic.ts` (`runTier1Semantic`) — masked document text → JSON profile + statements via `CallModel`.
4. **Pack-driven Reader (production target):** Worker → hive-agents HTTP; compiled pack prompt + pages → `hive.pack-driven-reader-extraction/0.2.0` JSON. Qualification mirror: `experiments/pack-driven-reader-l001`.
5. **Canonical study (Engine 2):** OpenAI v4/v4.1 proposal engines — case-wide semantic study, not per-document raw extraction.
6. **Discover:** Structure map / resolution — OpenAI Responses API via `CallModel`.

## Proposed migration to tiered gateway

| Current call site | Suggested tier | Gateway model (default) | Notes |
| --- | --- | --- | --- |
| `runTier1Semantic` (atoms) | **harvester** | `gemini/gemini-1.5-flash` | High-context per-document text → JSON; **wired in this change** |
| `dynamic-schema-generator` (future LLM) | **heavy_lifter** | `gpt-4o` | Complex schema / task interpretation when LLM replaces rules |
| Discover structure + resolution | **sorter** | `gpt-4o-mini` | Smaller JSON tasks, fast iteration |
| Canonical study v4 / reasoner | **heavy_lifter** | `gpt-4o` or `claude-3.5-sonnet` via LiteLLM alias | Keep `CallModel` adapter; route `createOpenAICallModel` base URL through `LITELLM_BASE_URL` |
| Story writer / client summary | **sorter** | `gpt-4o-mini` | Narrative micro-passes |
| Pack-driven Reader (hive-agents) | **harvester** | `gemini/gemini-1.5-flash` | Configure agent container to point at LiteLLM proxy + harvester model env |
| Global `createCallModelFromEnv` | Per-pass tier map | Env: `MODEL_HEAVY_LIFTER`, `MODEL_HARVESTER`, `MODEL_SORTER` | Long-term: replace single `MODEL_NAME` with tier-aware factory |

## Implementation status (this change)

- Added `engine/shared/src/llm/router.ts` — tier routing with optional `LITELLM_BASE_URL` / `LITELLM_API_KEY`.
- Added `engine/shared/src/llm/call-model-from-openai-client.ts` — `CallModel` adapter over OpenAI SDK chat completions (LiteLLM-compatible).
- Refactored **`engine/core/src/atoms/semantic.ts`** (`runTier1Semantic`) to use **harvester** tier by default; unit tests may still inject `callModel`.
