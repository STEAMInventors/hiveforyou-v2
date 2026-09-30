# Questions and User Intent

Questions are **first-class persisted objects**, versioned with answers.

## Question types (conceptual)

- MISSING_FACT  
- CONFLICT  
- IDENTITY  
- INTERPRETATION  
- CASE_CONTEXT  
- ANALYSIS_INTENT  
- PROFESSIONAL_DECISION  

## Answer effects

Tag whether an answer:

| Flag | Meaning |
|------|---------|
| `affects_canonical_truth` | May update validated canonical state |
| `affects_analysis` | Shapes Engine 2 emphasis / study context |
| `affects_projection` | Shapes what Customer/Pro surfaces |

Examples:

- *“What grade is the student currently in?”* → truth **yes**, analysis **yes**, projection **yes**.  
- *“Why are you reviewing these documents?”* → truth **no**, analysis **yes**, projection **yes**.

**User intent never contaminates canonical source truth** (laws in INDEX). Intent guides analysis and presentation.

See [ADR-005](../decisions/ADR-005-version-user-intent.md).

## Frontend snapshot (V2-001D)

The web app models a persistable **QuestionsAnswerSnapshot** (`apps/web/src/lib/questions/types.ts`):

- `questionSetId` + per-question `QuestionAnswerRecord` (value, status, `updatedAt`)
- `missingNodeStates` and `ambiguityNodeStates` (`MapNodeResolutionState`)
- `analysisIntent` and optional `userContext` lifted for Engine 2 study context

Question definitions carry `affectsCanonicalTruth`, `affectsAnalysis`, and `affectsProjection` flags; UI never exposes internal `QuestionType` enums to customers.

## V2-001E.1 — Relational question history

Immutable `answer_snapshots` remain audit artifacts. In addition, Postgres stores:

- `hive.case_questions` — semantic `question_key` (stable) vs `question_text` / `wording_version` (display)
- `hive.case_question_answers` — append-only answer versions
- `hive.study_run_question_answers` — exact answer version consumed by each study run

**The question is data. Why it was asked (`trigger_type`, metadata) is data. The answer version is data.**
