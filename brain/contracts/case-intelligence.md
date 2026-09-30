# Contract — Case Intelligence

**Status:** Implemented (V2-001E snapshot abstraction). Running snapshot is **`case-intelligence/2`**. Target **`case-intelligence/3`** contracts live in `@hiveforyou/shared/case-intelligence/3` (Slice 1A aligned with [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md)); runtime wire-in not started.

Versioned **`CaseIntelligenceSnapshot`** (`case-intelligence/2`) persisted after deterministic validation:

- Source documents, entities, **validated claims only**, claim_evidence links  
- Relationships, events, **conflicts** (canonical unresolved facts), missingness, derived claims from accepted candidates  
- Analysis intent + user context snapshots (reference only — not fused into claim text)  
- `caseScope` (`single_domain` | `multi_domain`), optional `domainSlices`, optional `crossDomainRelationships`  
- Domain pack version, validation result, study run id, monotonic `version` per case  

Rejected proposal items are **not** stored. Narrative / report prose is **not** stored in V2-001E.

Persistence port: `CaseIntelligenceRepository`.

`hive.case_intelligence_snapshots` stores each validated snapshot as versioned JSONB. A new study inserts a new version. Earlier versions are not overwritten.

**Persist intelligence, render many times.**

See [provenance.md](../architecture/provenance.md).
