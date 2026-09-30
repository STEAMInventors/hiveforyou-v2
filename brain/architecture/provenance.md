# Provenance



Every factual representation must resolve to **validated canonical claims** backed by evidence.



```text

SOURCE

  ↓

EVIDENCE CHIP / REF

  ↓

VALIDATED CLAIM

  ↓

RELATIONSHIP / DERIVATION

  ↓

CUSTOMER / PRO REPRESENTATION

```



- **No chip → no claim** (ADR-002): factual proposal claims without resolvable document evidence are **rejected**, not warned through.

- **No validated claim → no factual representation** in UX.

- **Customer objective and assertions are never evidence.** Document-backed facts require logical-document or source refs per study context rules—not customer context text.

- **Running `/2` study:** Engine 2 validation is domain-agnostic (structure + provenance); factual claims require `sourceType: document` with resolvable refs. See `packages/core/src/study/validate-proposal.ts`.

- **Target `/3` canonical case:** Factual atoms are **structured claims** (model-discovered construct + typed value + role) with chips on `EvidenceReference`. **ProposalLineage** records which study proposal item produced an accepted claim—it is **not** a chip and must not appear on evidence refs. A **previously unseen construct id is not a provenance failure**; rejection is for broken schema, refs, or missing locators—not pack vocabulary.

- **Missing information** (model-proposed gaps in `/3`) is **not** a validated claim. Descriptions of absence may omit evidence refs when there is no direct chip for the gap; when refs are present they explain **why** something is unresolved and must satisfy chip locator rules. Do not treat missing-information prose as canonical fact in projections.

- **No narrative candidates in proposal V1**; report/map prose comes from validated structure only.



**V2-001E.1:** `hive.intelligence_lineage` records where accepted intelligence items came from (`DOCUMENT_EVIDENCE`, `USER_ASSERTION`, `USER_CONTEXT`, `ANALYSIS_INTENT`, `DERIVED`). User answers are never stored as documentary evidence. Analysis intent never becomes a document chip.



See [ADR-002](../decisions/ADR-002-no-chip-no-claim.md), [ADR-003](../decisions/ADR-003-model-proposes-code-validates.md), [engine-2-canonical-case.md](engine-2-canonical-case.md).

