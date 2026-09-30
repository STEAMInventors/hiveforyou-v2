# Engine 2 — Canonical Case Model

**Status:** Approved (2026-09-29), **corrected** (2026-09-29) — dynamic model-discovered constructs; no pack construct whitelist. **Slice 1A** — `/3` contracts and JSON schema in `packages/shared`. **Slice 2** — model `canonical-study-proposal/3` + deterministic validated-proposal path (`runCanonicalStudyV3`, dev corpus script); no snapshot builder or production wire-in. Running production UI stays on `canonical-study-proposal/2` and `case-intelligence/2`.

This document is the approved successor to the running Engine 2 path in [engine-2.md](engine-2.md) and [ADR-006](../decisions/ADR-006-engine2-canonical-study.md). **This correction realigns the canonical-case design with ADR-006 decision 4:** flexible, model-discovered semantics; deterministic validation of structure, references, and provenance only—not Domain Pack vocabulary allowlists.

Engine 1 / Hive Discover stays frozen. This design does not change upload, authentication, storage, document discovery, completeness, or the case UI.

## Law

**Evidence provides reality. The model studies that evidence and proposes. Deterministic code validates structure, references, provenance, and internal integrity. One validated canonical snapshot drives the Customer report, the Pro report, and the Timeline.**

**No chip, no claim.** A factual canonical claim requires valid source provenance.

**No validated claim, no narrative statement.** Report sentences cite validated claim ids only.

Hive Core stays **domain-agnostic**. Construct ids such as `service_minutes`, `reading_fluency`, or `eligibility_decision` are **opaque strings proposed by the model from the case**. They are **not** predeclared in Hive Core and **must not** be hardcoded as an allowlist. Examples in documentation are illustrative only.

**Domain Packs and Domain Forge do not gate which constructs may enter the canonical case.** Pack knowledge may later **enrich model context** (terminology, document families, known patterns). That is **context**, not a whitelist of permissible canonical constructs.

## Corrected pipeline

```text
Engine 1 validated document / evidence inventory
        ↓
freeze study context (evidence, structure map, Engine 1 snapshot; objective as emphasis only)
        ↓
model canonical study across the evidence
        ↓
model proposes: entities, facts (construct + value), measurements, relationships,
               events, chronology, decisions, changes, conflicts, missing information, provenance
        ↓
deterministic validation (schema, ids, references, provenance, value shape, internal consistency)
        ↓
CanonicalCaseSnapshot (validated claims + derived indexes + unresolved)
        ↓
deterministic Customer / Pro / Timeline projections
```

There is no **APPLY_DOMAIN_PACK** step and no requirement that the model use only pack-catalog construct ids.

## Model responsibility (semantic)

The model performs document understanding and proposes the canonical content of the case:

- **Entities** — people, organizations, programs, accounts, etc., with labels and evidence.
- **Claims** — subject + **construct** (any stable string the model chooses) + **value** + **role** + optional unit and time anchors, each with evidence refs.
- **Relationships** — expressed as claims whose value is `entity_ref` (or equivalent structured claims), not a parallel truth layer.
- **Events and chronology** — time-anchored claims and/or explicit event proposals that validation ties back to accepted claims.
- **Decisions, changes, conflicts** — structured proposals referencing claim ids where required.
- **Missing information** — what the model infers is absent or unclear from the evidence (not copied blindly into narrative; validated and stored like other proposal items where the contract allows).

A **previously unseen construct id is not an error** merely because Hive has never seen it before. Rejection is only for **deterministic** failures (bad schema, broken refs, missing chip, invalid locator, inconsistent ids).

Optional **domain context** (terminology, rules, document families, learned patterns) may be injected into the study prompt or context to improve proposals. It must **not** cause code to reject otherwise valid proposals.

## Code responsibility (deterministic)

Code does **not** pretend to perform semantic domain judgment that requires reading documents. It validates what can be checked mechanically:

| Check | What code enforces |
| --- | --- |
| Schema | Proposal and snapshot match `/3` contract shapes. |
| Ids | Unique ids; referential integrity (entities, subjects, conflict claim ids). |
| Evidence | `sourceType: document` only for factual claims; source document exists in context. |
| Logical document | When the context has a structure map, `logicalDocumentId` resolves and matches the source document. |
| Locator | At least one of page, span, or snippet on factual evidence refs (chip law). |
| Provenance | Page bounds within logical document when provided. |
| Value shape | `ClaimValue` variant matches declared `kind`; required fields present. |
| Conflicts | Conflict rows reference **accepted** claim ids only. |
| Events / changes | Indexes reference validated claims; no orphan index rows. |
| Customer narrative | Sentences cite validated claim ids only (existing guard). |

Code **does not**:

- Reject a claim because `construct` is absent from a Domain Pack catalog.
- Enforce pack `valueKind`, `units`, `codes`, or allowed `roles` per construct id.
- Derive **missing_construct** / **missing_event** from pack expectations (pack expectations are not authoritative completeness law for Engine 2).

## Domain knowledge and the learning loop

Long-term loop (no automatic promotion to authoritative rules):

```text
cases
  → model canonical studies
  → recurring constructs, relationships, patterns (observations / candidates)
  → domain knowledge graph (Domain Forge)
  → richer **context** for future canonical studies
```

Production **does not** silently mutate Domain Packs from observations. Learned patterns inform the model and human review; they do **not** become a construct whitelist in Core validation.

`domainPackId` / `domainPackVersion` on study runs and snapshots record **which discover/study pack lineage applied to routing and optional context**, not **permission to accept a construct id**.

## A. What already exists and must be reused

| Piece | Where | Reuse |
| --- | --- | --- |
| Study orchestration | `runCanonicalStudy` | Load context, call the model, validate, persist, project. |
| Frozen study context | `CanonicalStudyContext` (`canonical-study-context/2`) | Evidence snapshot, structure map, logical documents, Engine 1 result, objective as non-evidence, prompt hash, idempotency. |
| Engine port | `CanonicalStudyEngine` | Fixture and OpenAI adapters. Fail closed when unconfigured. |
| Provenance checks | `validateDocumentEvidenceRefs` | Document-only evidence, `logicalDocumentId` when a structure map exists, page bounds, known source ids. |
| Evidence reference | `EvidenceReference` | `sourceDocumentId`, `logicalDocumentId`, page/span/snippet, `extractionId`. |
| Snapshot persistence | `hive.case_intelligence_snapshots` | Versioned JSONB. |
| Raw proposal persistence | `hive.study_artifacts` | Proposal JSON plus validation result. |
| Projection persistence | `hive.case_projections` | Customer and Pro views per intelligence version. |
| Lineage | `hive.intelligence_lineage` | `DOCUMENT_EVIDENCE` rows per chip. |
| Structure map completeness | `StructureMapCompleteness` | Engine 1 document expectations — input to **missing_document** unresolved rows only. |
| Narrative guard | `validateCustomerViewNarrativeClaims` | Sentences must cite validated claim ids. |
| Customer emphasis | `CustomerReportProjectionInput` | Objective and audience shape Customer view only. |
| Domain learning | post-validation lineage and observations | Structured metadata only; not a second truth. |

Engine 1 answers which documents exist and which expected documents are missing. Engine 2 reads that result; it does not rediscover documents.

## B. What is missing (product gap vs running `/2`)

The running snapshot still allows model prose on claims, free-typed events, and model-written missingness treated as trusted gaps. The `/3` canonical case closes that gap **without** pack ontologies:

- Factual atoms are **structured claims** (construct + typed value + role), not report sentences.
- **Timeline events** are indexes over time-anchored **validated** claims, not free-floating event types.
- **Missing information** is modeled explicitly (model-proposed and/or Engine 1 document gaps), validated structurally, not narrated as fact.
- **Chips** require locators on factual claims.
- **Projections** compose from validated claims; they do not copy model `statement` text.

## C. Minimal architecture (no pack catalog)

One **claim** is the factual atom. Measurements, decisions, statuses, and relationships are claims. Construct ids are **model-discovered opaque strings**.

```text
Engine 1 structure map + source bytes
        ↓
CanonicalStudyContext  (evidence + optional domain context; objective is emphasis only)
        ↓
CanonicalStudyProposal (model output, untrusted)
        ↓
deterministic validation  (no construct allowlist)
        ↓
CanonicalCaseSnapshot
        ↓
Customer report | Pro report | Timeline
```

`CanonicalCaseSnapshot` is the next payload of case intelligence (`case-intelligence/3`). It is not a second store or second truth type.

Out of scope for Core:

- Pack-driven construct catalogs used as validation gates.
- Domain-specific event lists or construct enums in `packages/core`.
- Render-model / LLM narrative pass.
- Engine 1 or case UI changes in early slices.

### Optional domain context (not validation)

When available, context may include discover pack metadata, terminology, document-type hints, or Forge-learned patterns. The model may use them to propose better construct ids and values. **Validation never rejects a proposal solely because a construct was not in that context.**

## D. Contracts

Schema ids: `canonical-study-proposal/3`, `case-intelligence/3`. Running `/2` stays until wire-in slice.

### ClaimRole

Closed enum in core (structural, not pack-per-construct):

`planned` | `required` | `decided` | `observed` | `current` | `historical` | `superseded` | `unknown`

### ClaimValue

```ts
type ClaimValue =
  | { kind: "quantity"; amount: number }
  | { kind: "text"; text: string }
  | { kind: "code"; code: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "entity_ref"; entityId: string }
  | { kind: "date"; value: string }
  | { kind: "period"; start?: string; end?: string }
  | { kind: "unknown" };
```

`text` is a short factual value, not a report sentence. `unit` sits on the claim next to a quantity.

### EvidenceReference

Same fields as today. Valid when: document source, ids resolve, logical document rule when map exists, and **at least one locator** (page, span, or snippet). Customer objective, discover answers, and Q&A are never evidence refs.

### ProposalLineage

```ts
type ProposalLineage = {
  proposalItemId: string;
  studyRunId: string;
};
```

Evidence location stays on `EvidenceReference` and `intelligence_lineage`; `proposalItemId` may appear in lineage metadata only.

### Proposed entity, claim, conflict

```ts
type ProposedEntity = {
  id: string;
  entityType: string; // model-discovered label
  label: string;
  evidenceRefs: EvidenceReference[];
};

type ProposedClaim = {
  id: string;
  subjectEntityId: string;
  construct: string; // opaque; not pack-whitelisted
  value: ClaimValue;
  unit?: string;
  role: ClaimRole;
  effectivePeriod?: EffectivePeriod;
  occurredOn?: string;
  evidenceRefs: EvidenceReference[];
};

type ProposedConflict = {
  id: string;
  claimIds: string[];
  kind: "value_disagreement" | "temporal_overlap" | "status_disagreement" | "other";
};
```

The model may also propose **missing-information** items in the proposal schema (exact shape in contract slice); those are validated structurally and surface in snapshot `unresolved` or a dedicated list—**not** as validated factual claims without chips.

Relationships are claims with `entity_ref` values (construct names the relationship).

### CanonicalStudyProposal

```ts
type CanonicalStudyProposal = {
  schemaVersion: "canonical-study-proposal/3";
  domainId: string;
  entities: ProposedEntity[];
  claims: ProposedClaim[];
  conflicts: ProposedConflict[];
  missingInformation: ProposedMissingInformation[];
  modelMetadata: { providerId: string; modelId?: string; proposalMode: "fixture" | "production" };
  proposedAt: string;
};
```

### ValidatedClaim

A proposed claim that passed **schema, referential, provenance, and value-shape** checks—not pack conformance.

```ts
type ValidatedClaim = {
  id: string;
  domainId: string;
  subjectEntityId: string;
  construct: string;
  value: ClaimValue;
  unit?: string;
  role: ClaimRole;
  effectivePeriod?: EffectivePeriod;
  occurredOn?: string;
  evidenceRefs: EvidenceReference[];
  proposalLineage: ProposalLineage;
};
```

### CanonicalEvent

Index over one validated claim with a time anchor (`occurredOn` or `effectivePeriod`). Built by code from accepted claims; the model does not author standalone timeline truth.

Optional **timelineOrderHint** on the claim or event row breaks ties when sorting; Core does not invent missing steps.

### Conflict

Proposal conflicts whose `claimIds` all refer to **accepted** claims. Code does not drop claims or pick a winner. Conflicts alone do not force `NEEDS_REVIEW` (ADR-006).

### UnresolvedItem

**Corrected kinds** (no construct whitelist fallout):

| Kind | Source | Meaning |
| --- | --- | --- |
| `missing_document` | `engine1_completeness` | Structure map expectation not satisfied (Engine 1). |
| `missing_information` | `model_proposal` or `validation` | Model-inferred gap or incomplete evidence; **not** a validated fact. |
| `conflict_open` | `conflict` | Accepted claims in unresolved disagreement. |

**Removed from architecture (Slice 1A):** `unrecognized_construct`, `missing_construct`, `missing_event`, and `pack_expectation` as validation/unresolved sources.

There is **no** path where a valid chip + schema claim is demoted to unresolved because the pack never declared the construct.

### CanonicalCaseSnapshot

```ts
type CanonicalCaseSnapshot = {
  schemaVersion: "case-intelligence/3";
  version: number;
  caseId: string;
  studyRunId: string;
  createdAt: string;
  caseScope: "single_domain" | "multi_domain";
  domainId: string;
  /** Lineage / audit: which pack row routed the domain workstream. Not a construct gate. */
  domainPackId: string;
  domainPackVersion: string;
  domainSlices?: Array<{
    domainId: string;
    studyRunId: string;
    domainPackId: string;
    domainPackVersion: string;
  }>;
  entities: Array<{ id: string; entityType: string; label: string; evidenceRefs: EvidenceReference[] }>;
  claims: ValidatedClaim[];
  events: CanonicalEvent[];
  conflicts: Conflict[];
  changes: Array<{
    id: string;
    subjectEntityId: string;
    construct: string;
    fromClaimId: string;
    toClaimId: string;
  }>;
  unresolved: UnresolvedItem[];
  validationResult: CanonicalStudyValidationResult;
};
```

`changes` indexes non-overlapping periods for the same subject + construct on accepted claims.

Analysis intent and customer objective remain on study context and Customer projection input—not on claims.

## E. Pipeline steps (orchestration names)

1. **LOAD_VALIDATED_EVIDENCE** — context freeze, structure map enrichment, source bytes. No Engine 1 re-run.
2. **BUILD_STUDY_CONTEXT** — `CanonicalStudyContext` plus optional **domain context** payload (terminology, guidance). No construct catalog required. `processingPolicy.intentAffectsFacts` stays `false`.
3. **MODEL_CANONICAL_STUDY** — domain-agnostic methodology prompt; optional context appended. Output `CanonicalStudyProposal`.
4. **VALIDATE_PROPOSAL** — schema, unique ids, entity refs, conflict refs, value kind vs JSON shape. Fatal schema failure fails the run; per-item failures reject that item only.
5. **VALIDATE_PROVENANCE** — document/logical-document/locator rules. Factual claims without a valid chip are rejected.
6. **RESOLVE_CONFLICTS** — keep conflicts whose claim ids were all accepted.
7. **BUILD_CANONICAL_SNAPSHOT** — `ValidatedClaim` rows, `CanonicalEvent` / `changes` indexes, `unresolved` from Engine 1 completeness + validated missing-information proposals + open conflicts.
8. **PERSIST** — `study_artifacts`, `case_intelligence_snapshots`, `intelligence_lineage`, domain-learning observations (metadata keys only), `case_projections`.

Idempotency fingerprint: case, domain, documents, answers, provider, model, prompt hash—**not** a study-pack construct catalog version.

Multi-domain: N domain studies → deterministic merge (conservative entity linking) after single-domain `/3` is tested.

## F. Projections

Customer, Pro, and Timeline read the same snapshot version. No model calls.

| Projection | Reads | Notes |
| --- | --- | --- |
| Timeline | `events` sorted by time, then tie-breakers | Gaps listed from `unresolved`, not invented events. |
| Customer | Validated claims grouped by composition rules | Sentences cite claim ids; objective/audience reorder sections only. |
| Pro | Full snapshot + chips | Shows conflicts, changes, unresolved, construct ids as stored. |

**Corrected:** projections do **not** depend on a pack `projection` catalog for permission to mention a construct. Generic composition: subject label, construct id, value, unit, role, period, claim citation. Optional pack **labels** for construct ids may improve display when context provides them; absence of a label does not hide a validated claim.

Unresolved rows render as unresolved; their content is not narrative fact.

## G. Persistence

No new tables required for this correction.

| Store | Role |
| --- | --- |
| `hive.study_contexts` | Frozen input; optional domain context snapshot when implemented. |
| `hive.study_runs` | Status, prompt identity, pack ids for lineage. |
| `hive.study_artifacts` | Raw proposal + validation. |
| `hive.case_intelligence_snapshots` | `CanonicalCaseSnapshot` JSON. |
| `hive.intelligence_lineage` | Chips for validated claims (and optionally unresolved items with evidence). |
| `hive.domain_learning_observations` | Recurring construct/pattern **signals** for Forge—**not** `CLAIM_REJECTED` for unknown construct ids. |
| `hive.case_projections` | Customer / Pro (and timeline blocks therein). |

## H. Code reuse and drift to fix later

Reuse: `runCanonicalStudy`, engines, `validateDocumentEvidenceRefs`, artifacts, intelligence repos, projections, lineage, narrative guard.

Running `/2` conflicts to replace in later slices: `ProposedClaim.statement`, model-written snapshot missingness, free-typed `ProposedEvent`, Customer prose from statements.

**Withdrawn design elements** (do not implement): study-pack **construct catalog**, `APPLY_DOMAIN_PACK`, `unrecognized_construct`, pack-expectation unresolved rows, prompt injection of construct allowlists, idempotency keyed on catalog version.

`packages/canonical` `buildCaseIntelligenceSnapshot` extends toward `/3`; not replaced.

## I. Implementation sequence (revised)

1. **Contracts (Slice 1A)** — `/3` types and JSON schema aligned (no pack-gating unresolved kinds; model-proposed missing information; claim-derived events).
2. ~~**Pack catalog.**~~ **CANCELLED** — no construct catalog for Engine 2 validation.
3. **Validation** — provenance locator rule + structural validation only; fixture proposals; no construct allowlist.
4. **Snapshot builder** — claims, events, changes, unresolved (Engine 1 docs + model missing info + conflicts).
5. **Projections** — generic claim composition + timeline; narrative claim-id guard.
6. **Prompt and engine** — methodology prompt; optional domain context; strict JSON schema aligned with adjusted `/3`.
7. **Wire-in** — persist `/3` through existing tables.
8. **Multi-domain merge** — after single-domain passes.

Do not start runtime validation/snapshot wire-in until explicitly authorized after Slice 1A.
