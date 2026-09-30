# Canonical Model

Single truth layer for a case. UI and exports project from here — no parallel “report truth.”

| Concept | Role | V2-001E |
|---------|------|---------|
| Case | Container for one analysis journey | Client `caseId` (session) |
| SourceDocument | Uploaded/stored source | Refs in study context |
| Entity / Claim / Evidence | Validated facts + chips | From accepted proposal partition |
| Relationship / Event | Typed structure | Validated proposals |
| Conflict | Mutually incompatible claims/state | **Persisted** when well-formed |
| Missingness | Known gaps | Persisted |
| Question / Answer | Versioned Q&A | Frozen in study context + relational history (V2-001E.1) |
| AnalysisIntent | User emphasis | Snapshot on intelligence; cannot alter facts |
| ProcessingRun | Versioned engine execution | `CanonicalStudyRun` + append-only events |
| CaseIntelligenceSnapshot | Validated revision | Versioned per case |

**No chip → no claim.** **No validated claim → no factual representation** in UX.

Schema tables follow milestones; V2-001E uses repository ports with Supabase adapters for persistence.

**V2-001E.1:** `study_run_documents`, `intelligence_lineage`, `domain_learning_observations`, and `domain_learning_candidates` complement Case Intelligence without creating a second truth layer.
