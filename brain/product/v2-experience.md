# V2 Experience

## Customer

- Visually exceptional, simple, prioritized, understandable, interactive.
- Evidence available on drill-down.
- Expected representations (non-exhaustive): case map / mind-map, timeline, key findings, progress/change, evidence navigation, open questions, missing information, conflicts.

## Professional

- Paid / locked; **same canonical truth** as Customer.
- Deeper structure: chronology, measurements, relationships, conflicts, missingness, full provenance, extraction/query affordances.
- **Unlocking Pro is authorization/payment**, not by default a new AI analysis run.

## Interaction model

UI reads **persisted validated intelligence**. Navigation and view changes do not trigger open-ended re-generation.

See [frontend-backend-contract.md](../architecture/frontend-backend-contract.md).

## V2-001A — Empty Upload (implemented)

First customer screen: document intake **before Engine 1**. The UI must not imply analysis, classification, or case facts—only that the user may select files.

### Visual language

- **Authoritative brand:** [HiveForYou-brand-guide.md](../HiveForYou-brand-guide.md) — logos in `apps/web/public/brand/`, HiveForYou CSS v1 (`apps/web/src/styles/`), Outfit (brand wordmark) + DM Sans (UI) + Source Serif 4 (quotes) via `next/font` in `layout.tsx`.
- **Legacy upload shell:** Tailwind `hive.*` tokens (`--hive-color-*` in `globals.css`) remain on some discover/upload routes until migrated to `--hfy-*`.
- **Layout:** Minimal header (SVG logo from brand guide), centered hero, dominant dashed dropzone, restrained privacy callout, minimal footer with placeholder legal links.

### Copy (canonical)

- Headline: *Turn your documents into something you can understand.*
- Supporting: *Upload what you have. Hive will organize the documents, understand how they relate, ask what it needs to know, and build a clear picture of your case.*
- Primary upload action: *Choose documents*; secondary: *or drag and drop files here*.
- Multi-file: supporting text states that many files can be added together in one go.

### Upload interaction

- Multi-select file input; accepted formats: PDF, Word (`.doc`/`.docx`), common images, plain text (see `upload-constants.ts`).
- Drag-over highlight, keyboard activation (Enter/Space on dropzone, visible focus rings), screen-reader status when files are selected (count only—no document list UI in this milestone).
- **No backend upload**, no persistence, no Engine 1 transition.

### Decorative documents

- Generic blank document cards with neutral line placeholders only—no dates, names, diagnoses, or findings.
- Floating motion on `md+` viewports; hidden on small screens; respects `prefers-reduced-motion`.

### Trust

- Restrained privacy copy only—no HIPAA/FERPA/encryption/certification claims.

### Components

`HiveHeader`, `UploadHero`, `DocumentDropzone`, `DocumentVisual`, `TrustMessage`, `HiveFooter` under `apps/web/src/components/`.

## V2-001B — Documents Added (implemented)

Same route (`/`) after the user selects files. **No Engine 1** — the UI shows only metadata from the selected `File` objects (name, extension/type, size, count, total size). No classification, extraction, or case intelligence.

### Copy (canonical)

- Badge: *Collection staged*
- Headline: *Your documents are ready.*
- Supporting: *Review what you've selected, add anything else you have, and let Hive begin understanding how your documents fit together.*
- Summary strip: `{N} document(s) selected · {total size}` — no “Ready for intake” or other status.
- Add more: *Add more documents* with format hint on `sm+`.
- Primary CTA: *Understand my documents* (transition boundary for V2-001C; processing not implemented).

### Interaction

- `UploadExperience` holds client-side `StagedDocument[]` (stable ids + `File` references) for downstream processing milestones.
- Remove row updates collection, count, and total; removing the last file returns to V2-001A empty upload (same page shell).
- Add more appends with the same accept rules as the dropzone (`upload-constants.ts`).
- Accessible remove buttons, truncated filenames with `title`, live region for collection count.

### Components

`UploadExperience`, `DocumentsAddedHero`, `DocumentCollectionSummary`, `DocumentRow`, `AddMoreDocumentsControl`, `UnderstandDocumentsCta`, plus reused `DocumentDropzone`, `UploadHero`, `TrustMessage`, header/footer.

## V2-001C — Document Discovery (implemented)

Route `/processing` after **Understand my documents**. Progressive human stages (*Reading your documents* → *Preparing a few questions*), then settled state with headline *Your documents are organized.* Document-level Engine 1 fixture/adaptor (`apps/web/src/lib/document-discovery/`). Reusable **Document Structure Map** grammar: `DocumentNode`, `DocumentGroup`, `DocumentRelationship`, `MissingDocumentNode`, `AmbiguousDocumentNode`, `DocumentStructureMap`, `DocumentInspector`. Inspector and map show **document metadata only** — no case claims, scores, diagnoses, or substantive summaries. Primary CTA: *Answer a few questions →* navigates to V2-001D. Future **Case Map** extends this grammar after Canonical Study; it does not replace it.

## V2-001D — Questions (implemented)

Route `/questions` after **Answer a few questions →** from document discovery. Headline: *A few things will help complete the picture.* Supporting copy explains that Hive organized documents and needs a few answers about gaps, changes, and priorities — **not** an intake form or technical pipeline.

### Interaction model

- **Compact document structure strip** at top (`CompactDocumentStructureMap`) — continuity from V2-001C; missing/ambiguous nodes update as users answer (EXPECTED, PROVIDED, UNAVAILABLE, NOT_APPLICABLE, AMBIGUOUS, RESOLVED).
- Three human groups: *Complete the picture*, *Help Hive understand your situation*, *Tell Hive what matters to you*.
- Five **design fixtures** generated from Engine 1 discovery shape (`apps/web/src/lib/questions/fixtures.ts`) — missing document (inline upload reuses staged collection), document ambiguity, post-document context, analysis intent (multi-select), optional free text.
- Typed contracts: question definition, answer record, map dispositions, `QuestionsAnswerSnapshot` for future versioning (`apps/web/src/lib/questions/types.ts`).
- All required questions must be answered before **Study my case →** enables; optional question does not block. Answers remain editable on-card.
- **Study my case →** navigates to `/study` (V2-001E). Server executes canonical study; UI shows human stages only until validation completes.

### Copy rules

Customer-facing UI must not expose internal pipeline names (Case Genesis, Canonical Workspace, Evidentiary Node Map, OCR verified, etc.). Question **humanReason** fields explain why Hive asked — no rule IDs, scores, or model reasoning.

### Principle

**V2-001D extends the Document Structure Map into an interactive completion experience.** Users resolve what Hive cannot know from documents alone before Canonical Study begins.

**Evidence determines truth. User intent determines focus.**

### Components

`QuestionsExperience`, `QuestionWorkspace`, `QuestionGroup`, `QuestionCard`, `QuestionReason`, `MissingDocumentQuestion`, `DocumentAmbiguityQuestion`, `ContextQuestion`, `AnalysisIntentQuestion`, `OptionalContextQuestion`, `QuestionDocumentReference`, `CompactDocumentStructureMap`, `StudyCaseCta` under `apps/web/src/components/questions/`.
