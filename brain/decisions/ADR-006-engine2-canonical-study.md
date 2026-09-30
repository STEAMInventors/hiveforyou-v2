# ADR-006 — Engine 2 Canonical Study (approved architecture)



**Status:** Accepted (2026-09-28), **amended** (2026-09-29) — domain-agnostic study methodology



## Context



Engine 2 must turn validated Engine 1 inventory into one canonical case representation and two projections (Customer, Pro), without redesigning Engine 1.



## Engine 2 law



**Evidence provides reality. Model studies and proposes. Code validates structure and provenance. Canonical truth drives both views.**



Engine 2 is **domain-agnostic**. Domain Packs may inform **Engine 1** discovery, completeness, and routing; they do **not** define an ontology ceiling for Canonical Study proposals.



## Decisions



1. **One canonical case, not one model call.** Multi-domain cases run **N domain-scoped studies** (separate runs, scoped evidence + shared methodology prompt), then **deterministic merge** into one `CaseIntelligenceSnapshot` (`case-intelligence/2`). Product invariant: one canonical case truth, not one LLM invocation.



2. **Strict logical-document provenance.** When a Structure Map is present on the study context, every **document-backed** factual claim must reference a **`logicalDocumentId`** resolvable in that map (page/span within logical bounds when provided). Physical `sourceDocumentId` alone is insufficient.



3. **Customer context is never evidence.** Customer objective, discover answers, and Q&A snapshots guide emphasis only. **Documentary factual claims require `sourceType: document` provenance.** Non-document evidence sources are rejected.



4. **Flexible semantics, strict structure.** `canonical-study-proposal/2` uses model-discovered string labels for entity/claim/relationship/event types. Deterministic validation covers schema, provenance, referential integrity, and temporal enums—not pack vocabulary allowlists.



5. **Projections in scope.** Customer View and Pro View are built deterministically from validated intelligence. No second truth discovery pass.



6. **Schema `/2`:** `canonical-study-context/2`, `canonical-study-proposal/2`, `case-intelligence/2`, projection schemas `customer-view/1`, `pro-view/1`.



7. **Model inputs:** In-scope source files, logical-document manifest, scoped Engine 1 discovery snapshot, and Structure Map intelligence (groups, relationships, chronology, discovery answers, completeness)—plus customer context and Q&A as non-evidence context.



8. **Persist raw proposals** in `hive.study_artifacts` (proposal JSON + validation result; no source file bytes).



9. **Wire production study engine** (OpenAI) when `HIVE_CANONICAL_STUDY_ENGINE=openai` and credentials configured.



10. **Run status:** Keep `SUCCEEDED` for accepted intelligence with conflicts/missingness.



11. **Shared entities (multi-domain merge):** Conservative linking—no auto-merge across domains without validated identity evidence.



## Implementation discipline



- **ADR-006 is authoritative** for V2-001G Engine 2 work.

- Do not reintroduce Domain Pack semantic allowlists into Engine 2 validation or prompts.

- If implementation requires an architectural change beyond this ADR, stop and seek approval.



## Consequences



- Engine 1 remains the home for pack-driven discovery/completeness; Engine 2 consumes `structure_map_json`, discovery snapshots, and source bytes via ports.

- Hive Core validates structure and provenance; it does not maintain a domain ontology for study findings.

