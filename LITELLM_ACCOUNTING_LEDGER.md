# LiteLLM Accounting Ledger

Generated: 2026-10-19. Purpose: track LLM call paths for cost accounting via LiteLLM proxy.

## Global intercept (catch-all)

| Path | Behavior |
| --- | --- |
| `engine/model-providers/src/create-call-model-from-env.ts` | When `LITELLM_BASE_URL` is set, OpenAI Responses API + file upload URLs route through the proxy; `LITELLM_API_KEY` overrides `OPENAI_API_KEY` (`resolveLiteLLMOpenAIEndpoints`). |
| `engine/model-providers/src/openai-call-model.ts` | Accepts proxy `filesUrl` / `responsesUrl` from the env factory. |

Legacy workers and passes that still use `createCallModelFromEnv` / `tryCreateCallModelFromEnv` inherit this intercept automatically.

## Tier routing (explicit gateway)

| Tier | Default model env | Wired call sites |
| --- | --- | --- |
| **harvester** | `MODEL_HARVESTER` | `engine/core/src/atoms/semantic.ts` (`runTier1Semantic`) |
| **sorter** | `MODEL_SORTER` | `engine/core/src/discover/engine.ts` (discover structure + resolution factories), `engine/core/src/study/canonical-reasoner/create-canonical-reasoner-from-env.ts` (OpenAI canonical graph reasoner) |
| **heavy_lifter** | `MODEL_HEAVY_LIFTER` | `engine/core/src/study/client-writer-pass.ts`, `engine/core/src/study/story/generateStory.ts`, `app/src/lib/story/story-writer-call-model.server.ts` |

Gateway implementation: `engine/shared/src/llm/router.ts` + `engine/shared/src/llm/call-model-from-openai-client.ts`.

## Leaking calls (not via tier router or intercepted OpenAI env factory)

These paths can still incur vendor-direct traffic or bypass LiteLLM unless separately configured:

| File | Mechanism | Notes |
| --- | --- | --- |
| `engine/model-providers/src/anthropic-call-model.ts` | `@anthropic-ai/sdk` (`new Anthropic`) | Used when `MODEL_PROVIDER=anthropic`. Route Anthropic through LiteLLM by pointing SDK base URL / using OpenAI-compatible proxy aliases, or migrate call sites to tier router. |
| `engine/model-providers/scripts/check-anthropic-schemas.mjs` | `@anthropic-ai/sdk` | Dev/CI schema check script only. |
| `engine/shared/src/llm/router.ts` | `new OpenAI({ baseURL })` | **Intentional** tier gateway; traffic should hit LiteLLM when `LITELLM_BASE_URL` is set. |
| `engine/model-providers/src/openai-call-model.ts` | Default `https://api.openai.com/v1/*` | **Only when `LITELLM_BASE_URL` is unset**; otherwise URLs come from `resolveLiteLLMOpenAIEndpoints`. |

No other in-repo `fetch('https://api.openai.com')` or `new OpenAI()` production call sites were found outside the table above (see `LLM_AUDIT_REPORT.md`).

## External service action item

**hive-agents HTTP Reader service** (Python DSPy / LiteLLM in container):

- Worker client: `worker/src/study/` (Reader HTTP to `HIVE_AGENTS_HOST`, e.g. `http://hive-agents:4321/study/reader`).
- Deploy: `deploy/oracle/docker-compose.yml` service **`hive-agents`**, config `deploy/oracle/agents.config.env`.
- **Manual:** Set hive-agents container env so model calls use the same LiteLLM proxy (`LITELLM_BASE_URL`, `LITELLM_API_KEY`, harvester model alias). In-repo TypeScript does not proxy those calls.

## Verification

- Run `pnpm typecheck` from repository root after changes.
- Set `LITELLM_BASE_URL` (+ key) in worker/app env and confirm LiteLLM logs show discover, study, writer, and legacy `CallModel` traffic.
