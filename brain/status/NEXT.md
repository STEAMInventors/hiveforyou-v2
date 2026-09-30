# Next milestone — authorized scope only

Status: **Slice 2 (model canonical-study-proposal/3 + validated proposal path) complete.** A **development-only inspection path** (real study flow → `runCanonicalStudyV3` → `hive.study_artifacts` → Canonical Study (DEV)) is implemented. Snapshot builder and Customer/Pro/Timeline projection of `/3` are **not authorized**.

**Authoritative design:** [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md) (corrected 2026-09-29).

## Architecture (explicit)

1. **Engine 1 is frozen.** No upload, discover, completeness, or case-UI redesign under this milestone.
2. **Engine 2 model** performs the **semantic Canonical Study** (document understanding; proposes entities, claims, relationships, events, conflicts, missing information, provenance).
3. **Model-discovered constructs are allowed.** Construct ids are opaque strings from the model. Constructs are **not** gated by a Domain Pack catalog.
4. **Deterministic validation** covers structure, referential integrity, provenance, locators, value shape, and snapshot integrity—not pack vocabulary conformance.
5. **Domain knowledge** (packs, Forge, optional study context) is **optional context/enrichment**, not a canonical-claim whitelist.

## CANCELLED (do not implement)

- Engine 2 construct catalog (former “Slice 2 — pack catalog”)
- **APPLY_DOMAIN_PACK** semantic gating
- Pack-based construct / value / unit / role allowlists
- **unrecognized_construct** rejection architecture
- Pack-derived **missing_construct** / **missing_event** (and **pack_expectation** unresolved rows)
- Idempotency keyed on study-pack construct catalog version
- Prompt injection of construct allowlists for validation

## Running code

**Study and Case Intelligence persistence remain on `/2`.** `/3` contracts in `packages/shared` are ready for the next runtime slices when authorized.

## Held until explicitly authorized

1. Multi-domain orchestrator + merge (N workstreams)
2. Optional pack-driven **display** labels (not validation gates)
3. Canonical-case **runtime** slices: validation → snapshot builder → projections → prompt/engine → wire-in → multi-domain merge

## Still out of scope

- V2-001F Case Map UX (unless explicitly pulled forward)
- Payments, Pro unlock entitlements
- Domain learning analytics / automatic pack mutation
- Engine 1 redesign
- Domain Forge as authoritative Engine 2 validation source

Do not implement beyond this milestone without explicit approval.
