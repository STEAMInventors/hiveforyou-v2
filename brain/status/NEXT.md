# NEXT - authorized agentic scope

Branch: **refactor/engine-boundary**. Legacy slice scope: [NEXT-v2-slices.md](NEXT-v2-slices.md).

**Current ticket:** T0.3

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| T0.1 | canonical-study **v4.1** prompt/schema alignment with `canonical-study-proposal/4`; route v4.1 through v4 validation/runtime (`isV4PromptVersion`) | Ready for review |
| T0.2 | Baseline capture: L001 + caleb9 under v4 and v4.1, recorded model calls, no scoring | Done |
| T0.3 | Prompt caching in Anthropic provider; cache system prompt + document attachments and record cache read/write tokens | In progress |

## Log

| Date | Ticket | SHA | Notes |
|------|--------|-----|-------|
| 2026-10-07 | T0.2 | f44f77e | Baseline capture complete: L001 and caleb9 recorded under v4 and v4.1; four baseline files plus recordings committed; no scoring performed. |
| 2026-10-07 | T0.2 | — | Plan owner explicitly advanced authorized scope to T0.2; unrelated T0.1 global-test blocker (domain-pack boundary) remains parked. |
| 2026-10-07 | T0.1 | ce5f856 | v4.1 prompt/schema alignment and v4 runtime routing implemented; targeted tests pass; formal exit pending repo-wide test/build blockers and worker production verification |
| 2026-10-07 | T0.1 | 548f124 | T0.1 runtime verification passed on Oracle: promptVersion v4.1, engine v4, study load-context succeeded. Formal completion remains blocked only by the unrelated repo-wide domain-pack boundary test. |
