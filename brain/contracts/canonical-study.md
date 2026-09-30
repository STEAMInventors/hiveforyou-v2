# Contract — Canonical Study



**Status:** V2-001E implemented; **V2-001G** `/2` with domain-agnostic methodology (2026-09-29)



## Client submission



Clients send **`StartCanonicalStudyRequest`** only:



- `caseId`

- `sourceDocuments` (refs — no file bytes)

- `engine1Result` (discovery snapshot)

- `discoveryRunId` when adaptive discover completed

- `questionSet` + `answerSnapshot`



The UI **must not** assemble or persist `CanonicalStudyContext`. Core orchestration:



1. Validates readiness  

2. Loads Structure Map from discover artifacts when `discoveryRunId` present  

3. Resolves domain workstream(s) by stable `domainId` (Discover pack identity for routing/audit)  

4. Computes **idempotency key** per domain workstream: `caseId + domainId + document fingerprint + answer fingerprint + pack version`  

5. Freezes context, persists, runs Engine 2 per domain, validates, merges multi-domain, persists intelligence + projections + study artifacts  



## CanonicalStudyContext (`canonical-study-context/2`)



Immutable for one **domain study run**. Includes Structure Map slice, logical documents, scoped Engine 1 snapshot, Q&A, **`Engine2DomainCustomerContext`** (objective only — never evidence), `processingPolicy.intentAffectsFacts: false`.



Legacy field `domainPackVocabulary` may remain on persisted rows for audit; **Engine 2 does not validate proposals against it.**



## Proposal (`canonical-study-proposal/2`)



Model output only. Semantic types are **model-discovered strings**. Factual claims require **document** evidence refs with **`logicalDocumentId`** when logical documents are on context.



**Customer objective, Q&A, and analysis intent are context only—not evidence.**



## Multi-domain



Not one model call. **N domain runs → deterministic merge → one `case-intelligence/2` revision.**



`AMBIGUOUS` domain resolution: fail closed (no study).



## Idempotency



Per-domain fingerprint. Completed domain run → reuse. Case-level merge produces one new intelligence version when all domain runs succeed.



## Engine configuration



- `HIVE_CANONICAL_STUDY_ENGINE=fixture` — dev/test  

- `HIVE_CANONICAL_STUDY_ENGINE=openai` — OpenAI when configured  

- Unconfigured → fail-closed  



## Audit



Raw proposals: `hive.study_artifacts` (`raw_proposal_json`, `validation_result_json`). Prompt id/version/sha256 on each `study_run`. Source document bytes are not stored in study artifacts.



See [engine-2.md](../architecture/engine-2.md), [ADR-006](../decisions/ADR-006-engine2-canonical-study.md).

