# Architecture Overview

```text
Upload / intake
    → Engine 1 (discover, route, completeness)
    → Questions + versioned answers + intent
    → Canonical study context
    → Engine 2 (deep analysis)
    → Proposals → Pack rules → Code validation
    → Persist Case Intelligence
    → Projections for Customer / Pro UI
```

| Layer | Doc |
|-------|-----|
| Domain-agnostic core | [hive-core.md](hive-core.md) |
| Discovery pipeline | [engine-1.md](engine-1.md) |
| Deep analysis | [engine-2.md](engine-2.md) |
| Truth model | [canonical-model.md](canonical-model.md) |
| Evidence chain | [provenance.md](provenance.md) |
| Q&A | [questions-and-intent.md](questions-and-intent.md) |
| Moat | [intelligence-flywheel.md](intelligence-flywheel.md) |
| Audit | [event-log.md](event-log.md) |
| API boundary | [frontend-backend-contract.md](frontend-backend-contract.md) |

Domain-specific behavior: **Domain Packs** (`domain-packs/`, described in `brain/domains/`). Not in core. One registry (`domain-packs/registry`) loads them.

**Raw evidence lives in private object storage. Metadata and immutable execution records live in Postgres.**

**A Canonical Study records the exact evidence snapshot, Domain Pack version, answer snapshot, model/provider, and prompt version/hash used to produce it.**
