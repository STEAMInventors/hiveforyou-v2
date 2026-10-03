# Hive Core

Hive Core is **domain-agnostic**. It orchestrates engines, canonical persistence, validation plumbing, question lifecycle, and projections — but does **not** encode concepts like IEP goals, Medicaid transfers, or bankruptcy schedules.

Core responsibilities (conceptual):

- Case and document lifecycle
- Engine orchestration and versioned processing runs
- Canonical read/write with validation gates
- Question generation plumbing (patterns may be pack-informed)
- Projection of validated intelligence to experience layers
- Learning candidate capture (review path to packs)

**Forbidden in core:** domain predicates, domain document taxonomies, domain-specific interpretation rules, and direct imports of a Domain Pack implementation.

Those live in `domain-packs/`. Generic loading and execution contracts live in `packages/domain-pack`. Core, the web UI, Intake, and Jev read packs only through the registry in `domain-packs/registry` (`@hiveforyou/domain-packs`).

See [ADR-001](../decisions/ADR-001-domain-packs.md) and [domains/README.md](../domains/README.md).
