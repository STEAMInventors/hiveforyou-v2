# Contract — Projections



**Status:** Authorized with V2-001G Engine 2



Read-optimized views derived from **one** validated Case Intelligence revision. The **running** snapshot is `case-intelligence/2`; the **approved target** is `case-intelligence/3` per [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md).



| Projection | Schema | Purpose |

|------------|--------|---------|

| Customer View | `customer-view/1` | Prioritized, simpler; objective echo labeled non-evidence; evidence chips |

| Pro View | `pro-view/1` | Full structure, chronology, conflicts, gaps, provenance |



## Rules



- Same underlying canonical revision — **Pro gets depth, not different truth**

- **No validated claim → no narrative statement** in Customer View prose blocks

- Projections **must not** reread Storage or call discovery/study engines for new facts

- **Running `/2`:** Customer/Pro builders compose from validated proposal items (claims, events, conflicts, missingness) with deterministic rules; Domain Pack may supply **display** hints where wired—never permission to show or hide validated claims.

- **Target `/3`:** Compose from **validated claims** (opaque construct ids), timeline **events** (indexes over time-anchored claims), **changes**, **conflicts**, and **unresolved** rows. Generic composition uses subject label, construct id, value, unit, role, period, and claim citation. Optional pack **labels** for construct ids improve display when context provides them; **absence of a label does not hide a validated claim.** Domain Packs do **not** gate which constructs may appear in projections.

- Optional render LLM: preselected claim IDs only; output validated against claim ID set

- Customer context (objective, audience) may shape **Customer** emphasis only; Pro uses canonical intelligence only

- Unresolved rows (missing document, missing information, open conflict) render as unresolved; their text is **not** narrative fact



Persistence: `hive.case_projections` (immutable per `case_id + intelligence_version + projection_kind`).



See [v2-experience.md](../product/v2-experience.md), [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md), [ADR-006](../decisions/ADR-006-engine2-canonical-study.md).

