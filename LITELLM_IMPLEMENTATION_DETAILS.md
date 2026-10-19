# LiteLLM Gateway — Implementation Details

**Document status:** Technical brief for the LiteLLM architectural migration (read-only audit, 2026-10-19).
**Related artifacts:** `LITELLM_ACCOUNTING_LEDGER.md`, `LLM_AUDIT_REPORT.md`.

---

## Architecture Overview

HiveForYou routes LLM traffic through a **LiteLLM proxy** so that applications and workers never hold vendor root credentials. The split of responsibility is:

| Layer | Responsibility | Credentials |
| --- | --- | --- |
| **LiteLLM proxy** | Terminates OpenAI-compatible (and configured multi-vendor) requests; maps model aliases to upstream providers; centralizes logging and cost accounting | Real vendor API keys (OpenAI, Google, Anthropic, etc.) configured on the proxy |
| **Hive application / worker** | Builds prompts, validates proposals, selects **task tier** or legacy `CallModel` paths | `LITELLM_API_KEY` (proxy virtual key) and optionally `OPENAI_API_KEY` as fallback when the proxy key is unset |

Two complementary integration patterns coexist:

1. **Explicit tier gateway** — `getLLMRouter()` in `@hiveforyou/shared` constructs an OpenAI SDK client pointed at `LITELLM_BASE_URL` and selects a tier-specific model alias (`MODEL_HARVESTER`, `MODEL_SORTER`, `MODEL_HEAVY_LIFTER`). Calls use **Chat Completions** via `createCallModelFromOpenAIClient()`.
2. **Global intercept (legacy `CallModel`)** — `createCallModelFromEnv()` in `@hiveforyou/model-providers` rewrites OpenAI **Responses API** and **Files API** URLs to the proxy when `LITELLM_BASE_URL` is set. Existing study/discover/pro paths that still use the fetch-based OpenAI adapter inherit routing without per-call-site changes.

When `LITELLM_BASE_URL` is **unset**, tier routing falls back to `https://api.openai.com/v1` and the OpenAI adapter uses direct `https://api.openai.com/v1/responses` and `/v1/files` endpoints.

---

## Tiered Routing (`engine/shared/src/llm/router.ts`)

### Task tiers

| Tier | Env override | Default model (LiteLLM alias) | Typical workload |
| --- | --- | --- | --- |
| **Harvester** | `MODEL_HARVESTER` | `gemini/gemini-1.5-flash` | High-volume, per-document text → structured JSON |
| **Sorter** | `MODEL_SORTER` | `gpt-4o-mini` | Structure mapping, resolution, graph reasoner (OpenAI path) |
| **Heavy lifter** | `MODEL_HEAVY_LIFTER` | `gpt-4o` | Narrative / case-view writer passes, story generation |

### Router behavior

- Reads `LITELLM_BASE_URL` and `LITELLM_API_KEY` (fallback: `OPENAI_API_KEY`) from `process.env`.
- Instantiates `new OpenAI({ baseURL, apiKey })` — the official `openai` npm package is a dependency of `@hiveforyou/shared` specifically for this gateway.
- Returns `{ model, client }` for the requested `TaskTier`: `"harvester" | "sorter" | "heavy_lifter"`.

### Wired call sites

| Tier | File / feature | Notes |
| --- | --- | --- |
| **Harvester** | `engine/core/src/atoms/semantic.ts` — `runTier1Semantic()` | Tier-1 document semantic extraction (profile + statements). Tests may inject `callModel` / `model`. |
| **Sorter** | `engine/core/src/discover/engine.ts` — `createDiscoverEngineFromEnv`, `createDiscoverResolutionEngineFromEnv` via `resolveDiscoverSorterTier()` | Discover structure and resolution when an OpenAI/proxy key is present and no test injection overrides tier. |
| **Heavy lifter** | `engine/core/src/study/canonical-reasoner/create-canonical-reasoner-from-env.ts` | OpenAI mode only (`HIVE_CANONICAL_GRAPH_REASONER_ENGINE=openai`); uses **heavy_lifter** tier + `createCallModelFromOpenAIClient`. Anthropic reasoner mode requires an injected `callModel` (no tier router). |
| **Heavy lifter** | `engine/core/src/study/client-writer-pass.ts` — `runClientWriterPass()` | Client-facing case view writer pass. |
| **Heavy lifter** | `engine/core/src/study/story/generateStory.ts` | Story writer JSON generation. |
| **Heavy lifter** | `app/src/lib/story/story-writer-call-model.server.ts` — `createStoryWriterCallModel()` | Next.js server wiring for story writer. |

### Adapter

`engine/shared/src/llm/call-model-from-openai-client.ts` implements the shared `CallModel` interface using `client.chat.completions.create()`, including JSON schema / JSON object response formats. This is the bridge between tier-routed SDK clients and existing engine code that expects `CallModel`.

---

## The Global Intercept (`engine/model-providers/src/create-call-model-from-env.ts`)

Legacy and global model access flows through `createCallModelFromEnv()` / `tryCreateCallModelFromEnv()`. For OpenAI provider:

### `resolveLiteLLMOpenAIEndpoints()`

When `LITELLM_BASE_URL` is set (trimmed, trailing slashes stripped):

- **API key:** `LITELLM_API_KEY` → else `OPENAI_API_KEY`
- **Responses URL:** `{LITELLM_BASE_URL}/responses`
- **Files URL:** `{LITELLM_BASE_URL}/files`

When unset, URLs remain `https://api.openai.com/v1/responses` and `https://api.openai.com/v1/files`.

The factory passes these URLs into `createOpenAICallModel()` (`engine/model-providers/src/openai-call-model.ts`), which uses **`fetch`** against the configured endpoints — not the OpenAI SDK. That is how “legacy” Responses API traffic is forced through the proxy without rewriting every call site.

### Consumers (non-exhaustive)

- App: `app/src/lib/model/call-model.server.ts` — `callModelEnvFromServerEnv()` forwards `LITELLM_*` and keys into the env record passed to `createCallModelFromEnv`.
- Worker: `worker/src/study/build-worker-study-deps.ts` — `tryCreateCallModelFromEnv` for canonical study bundle wiring.
- Experiments and CLI tools listed in `LLM_AUDIT_REPORT.md`.

### Legacy env warnings

`LEGACY_MODEL_ENV_VAR_NAMES` (e.g. `HIVE_DISCOVER_MODEL`, `HIVE_OPENAI_MODEL`) are **ignored** with one-time console warnings; operators should use `MODEL_PROVIDER` / `MODEL_NAME` for the global factory and tier env vars for gateway-routed paths.

---

## Environment Configuration

### Application server (`app/src/lib/env/server-env.ts`)

`ServerEnv` optionally includes `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `OPENAI_API_KEY`, and global model settings. These are **not** in `SERVER_REQUIRED_ENV_KEYS`; model keys are required only when a code path invokes LLM features.

`callModelEnvFromServerEnv()` (`app/src/lib/model/call-model.server.ts`) projects server env into the shape expected by `@hiveforyou/model-providers/env`, including LiteLLM fields.

**Note:** There is no `app/src/lib/intake/call-model.server.ts`; intake OCR paths do not call LLMs. App-side model wiring lives under `app/src/lib/model/call-model.server.ts`.

### Recommended `.env` snippet (app, worker, or local dev)

```bash
# LiteLLM proxy (application holds proxy key only)
LITELLM_BASE_URL=https://your-litellm-host/v1
LITELLM_API_KEY=sk-litellm-virtual-key

# Fallback if LITELLM_API_KEY is omitted (direct OpenAI or proxy-accepted OpenAI key)
# OPENAI_API_KEY=sk-...

# Tier model aliases (must match LiteLLM model names / router entries)
MODEL_HARVESTER=gemini/gemini-1.5-flash
MODEL_SORTER=gpt-4o-mini
MODEL_HEAVY_LIFTER=gpt-4o

# Global legacy factory (Responses API paths — still intercepted when LITELLM_BASE_URL is set)
MODEL_PROVIDER=openai
MODEL_NAME=gpt-5.6-sol
MODEL_MAX_OUTPUT_TOKENS=16000
```

Repository root and `app/.env.example` do **not** yet document `LITELLM_*` or tier variables; operators should treat the snippet above as the source of truth until examples are updated.

### URL shape

- **Tier router:** `LITELLM_BASE_URL` is passed to the OpenAI SDK as `baseURL` (default fallback: `https://api.openai.com/v1`).
- **Global intercept:** `{LITELLM_BASE_URL}/responses` and `/files`. Ensure the proxy base URL matches LiteLLM’s OpenAI-compatible prefix (typically includes `/v1` if that is how the proxy is mounted).

---

## External Agents (`hive-agents`)

Pack-driven **Reader** extraction runs in a separate Python/DSPy container. The worker calls it over HTTP (`HIVE_AGENTS_HOST` / port); TypeScript does not proxy those model calls.

### `deploy/oracle/docker-compose.yml` — current state

The `hive-agents` service:

- Uses `env_file`: `agents.config.env` and `/etc/hive-worker/worker.env`
- Sets inline `environment`:
  - `MODEL_PROVIDER: anthropic`
  - `MODEL_NAME: claude-opus-5-5`

There is **no** `LITELLM_BASE_URL`, `LITELLM_API_KEY`, or `OPENAI_BASE_URL` in compose. Committed `deploy/oracle/agents.config.env` likewise keeps Anthropic-direct settings and agent bind metadata only.

### Operational gap

To align hive-agents spend with LiteLLM accounting, container env must be updated **manually** (or via future deploy changes) so the agent runtime uses the same proxy URL, proxy key, and harvester-tier model alias as documented in `LITELLM_ACCOUNTING_LEDGER.md`. In-repo Oracle deploy files have **not** been updated for that migration as of this audit.

Worker config (`deploy/oracle/worker.config.env`) sets `MODEL_PROVIDER=openai` and `MODEL_NAME=gpt-5.6-sol` for in-process study/discover; LiteLLM variables would typically live in the secret overlay `/etc/hive-worker/worker.env` (not committed).

---

## Paths Still Outside Tier Routing or Proxy

Documented in `LITELLM_ACCOUNTING_LEDGER.md` and confirmed by scan:

| Path | Issue |
| --- | --- |
| `engine/model-providers/src/anthropic-call-model.ts` | Native `@anthropic-ai/sdk`; used when `MODEL_PROVIDER=anthropic`. Does not use `LITELLM_BASE_URL` unless SDK base URL is configured separately. |
| ~~hive-agents Reader~~ | **Fixed:** `agents/src/hive_agents/lm.py` requires `LITELLM_BASE_URL` + `LITELLM_API_KEY`; Reader uses **harvester** tier, Writer shadow uses **heavy_lifter**. Set gateway secrets in `/etc/hive-worker/worker.env`. |
| Canonical study OpenAI v4 / v4.1 engines | Still use injected `CallModel` from `createCallModelFromEnv` (Responses API) — **intercepted** when `LITELLM_BASE_URL` is set, but **not** tier-selected unless refactored. |
| ~~App discover / canonical factories~~ | **Fixed:** `discoverEngineFromServerEnv` passes Responses `callModel` only; `resolveDiscoverSorterTier()` always selects `MODEL_SORTER`. Canonical study v4 uses `MODEL_HEAVY_LIFTER` for model id with intercepted Responses transport. |
| Pro case Q&A | `app/src/lib/case-summary/pro-query-service-server.ts` uses `callModelFromServerEnv` (global intercept, not tier router). |

---

## Verification Checklist

1. Set `LITELLM_BASE_URL` and `LITELLM_API_KEY` on app and worker (and tier env vars as needed).
2. Run `pnpm typecheck` from the repository root.
3. Exercise discover, tier-1 atoms, story writer, and a legacy Responses API study pass; confirm LiteLLM access logs show expected model aliases.
4. Track hive-agents separately until container env points at the proxy.

---

## File Index (implementation touchpoints)

| Component | Path |
| --- | --- |
| Tier router | `engine/shared/src/llm/router.ts` |
| SDK → CallModel adapter | `engine/shared/src/llm/call-model-from-openai-client.ts` |
| Global OpenAI URL intercept | `engine/model-providers/src/create-call-model-from-env.ts` |
| OpenAI Responses fetch adapter | `engine/model-providers/src/openai-call-model.ts` |
| App env + forwarding | `app/src/lib/env/server-env.ts`, `app/src/lib/model/call-model.server.ts` |
| Oracle deploy | `deploy/oracle/docker-compose.yml`, `deploy/oracle/agents.config.env`, `deploy/oracle/worker.config.env` |
| Accounting / audit | `LITELLM_ACCOUNTING_LEDGER.md`, `LLM_AUDIT_REPORT.md` |
