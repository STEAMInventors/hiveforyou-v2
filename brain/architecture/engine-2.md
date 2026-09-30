# Engine 2 — Deep Analysis



**Status:** V2-001G — domain-agnostic Canonical Study (methodology prompt + strict validation). This document describes the running code.

The approved successor design (corrected 2026-09-29) is [engine-2-canonical-case.md](engine-2-canonical-case.md). Running code remains on `/2` per ADR-006 until authorized wire-in slices. Next contract work: **Slice 1A** (see [NEXT.md](../status/NEXT.md))—not started unless explicitly tasked.



## Law



**Evidence provides reality. Model studies and proposes. Code validates structure and provenance. Canonical truth drives both views.**



(Discover/completeness: **Model proposes. Pack defines. Code validates.** — Engine 1 only.)



## Flow



1. `StartCanonicalStudyRequest` (client) + persisted discover **Structure Map** when available  

2. Core builds **CanonicalStudyContext** (`/2`) per domain workstream (server only)  

3. **`CanonicalStudyEngine.study(context)`** → `CanonicalStudyProposalV2` (one call **per domain** workstream)  

4. Deterministic **validateCanonicalStudyProposal** (schema, logical-document provenance, referential integrity—**not** pack vocabulary)  

5. Persist **study artifact** (raw proposal + validation); persist **CaseIntelligenceSnapshot** (`/2`) from accepted partition only  

6. **Merge** domain slices when multi-domain → one canonical case revision  

7. **Project** Customer View + Pro View from same revision (deterministic; narrative bound to claim IDs)  

8. Run status: `SUCCEEDED` | `NEEDS_REVIEW` | `FAILED`  



## Product invariant



**One canonical case → two views.** Multi-domain is **N domain studies + merge**, not N canonical truths.



## Model inputs



- Versioned **Canonical Study methodology** prompt (`canonical-study-v2`)  

- Scoped **source files** (bytes via OpenAI file inputs)  

- **Engine 1 discovery** snapshot (classifications, groups, relationships, missing docs)  

- **Structure Map** slice (logical documents, chronology, cross-doc relationships, discovery answers, completeness)  

- **Customer objective** + **Q&A snapshot** (context only)  



Domain Packs do **not** supply Engine 2 semantic allowlists.



## Provenance



When Structure Map is on context, document-backed factual claims require **`logicalDocumentId`**. Only **`sourceType: document`** evidence is allowed for factual claims.



## NEEDS_REVIEW



Only when a validation/domain rule sets **`requiresHumanAdjudication: true`**. Well-formed **conflicts** are accepted as unresolved facts — they do not automatically trigger NEEDS_REVIEW.



## Model proposes / code validates



The model never writes canonical truth. Projections do not reread source files.



## Providers



- `FixtureCanonicalStudyEngine` — explicit `HIVE_CANONICAL_STUDY_ENGINE=fixture`  

- **OpenAI production engine** — `HIVE_CANONICAL_STUDY_ENGINE=openai` when configured  

- Unconfigured production → fail-closed  



Base instructions: `packages/core/prompts/canonical-study/` (versioned file + SHA on run).



Contracts: [canonical-study.md](../contracts/canonical-study.md), [case-intelligence.md](../contracts/case-intelligence.md), [projections.md](../contracts/projections.md), [ADR-006](../decisions/ADR-006-engine2-canonical-study.md).

