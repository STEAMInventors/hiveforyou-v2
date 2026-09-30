# Hive Core

Hive Core is **domain-agnostic**. It orchestrates engines, canonical persistence, validation plumbing, question lifecycle, and projections — but does **not** encode concepts like IEP goals, Medicaid transfers, or bankruptcy schedules.

Core responsibilities (conceptual):

- Case and document lifecycle
- Engine orchestration and versioned processing runs
- Canonical read/write with validation gates
- Question generation plumbing (patterns may be pack-informed)
- Projection of validated intelligence to experience layers
- Learning candidate capture (review path to packs)

**Forbidden in core:** domain predicates, domain document taxonomies, domain-specific interpretation rules. Those live in Domain Packs.

See [ADR-001](../decisions/ADR-001-domain-packs.md).
