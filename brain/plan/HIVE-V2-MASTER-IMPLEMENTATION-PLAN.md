# HiveForYou V2 — Master Implementation & Status Register

**As of:** 2026-10-17 (workflow proposal and observed production follow-up; earlier status snapshot retained)  
**Purpose:** Unified, granular record of the end-to-end product, Reader/Writer agents, deterministic validation, Inverted UI, quality gates, and deployment.  
**Document status:** Planning/status synthesis only — no code changes or deployment authorized.  
**Architecture:** `HIVE-ARCHITECTURE-V2-PROPOSED.md` is the **current proposed architecture**, not a silently approved runtime migration.  
**Historical execution reference:** `AGENTIC-PLAN.md` v1.1, `REPO-MAP.md`, `NEXT.md`; preserve until formally replaced.  
**UI record:** `HIVE-UI-MIGRATION-PLAN.md` (Phases UI-1 to UI-6).

## Status convention and evidence

- **Implemented locally (reported):** Cursor reported changes and tests; not independently inspected in a checked-out live repo here.
- **Existing / demonstrated:** Specific existing functionality or infrastructure was observed in user-reported repository mapping, tests, or Oracle logs; this **does not** close a broader architectural ticket.
- **Partial / not qualified:** Some path exists but full target capabilities or conformance remain unverified.
- **Planned / review:** In source plans; no completed proof in the available project records.
- **Parked:** Explicitly deferred; no work without new approval.
- **Needs verification:** No reliable current status; do not infer absence or completion.

**Critical status caveat:** The October 7 `NEXT.md` still marks Agentic Plan T0.1 in progress and Phases 1–8 not started. That tracker is historically useful but **not synchronized** with the October 16 implementation reports. Do not rewrite its ticket statuses without a separate reconciled review. UI phases numbered 1–6 are **not** the same as Agentic Plan phases numbered 0–8.

## Executive overview

| Workstream | Confirmed/claimed progress | Open / next | Status |
|---|---|---|---|
| Product entry, authentication and intake | Existing landing/upload handoff; intake workspace; backend orchestration | UI preservation and end-to-end browser QA | Existing, frozen |
| Document discovery and extraction | Live document/pages pipeline and Reader agent service; `/health` 200 on Oracle | Contract and IEP v0.2 conformance, full case evaluation | Partial / review |
| Reader provenance and verifier | Local verifier listener and quote verification path exist | Exhaustive typed coverage, semantics, thresholds, rejection regression | Partial / review |
| Canonical Study and case composition | Generation/reuse and projection routes exist; UI Phase 3 done locally | Proposed domain-neutral pack-driven architecture and portability qualification | Partial / review |
| Investigator / insight checks | Deterministic primitives and IEP rulebook documented | DSPy Investigator evidence workflow/grade/gate | Planned / review |
| Writer agent / UI trees | Writer shadow runs, unique `writerRunId`, accepted tree, app polling; Oracle agent service up | Fully prove composition/gates, provenance, actual live report generation | Partial / final verification |
| Inverted UI frontend | UI migration Phases 1–4 locally implemented | Evidence interactions UI-5 and responsive QA UI-6 parked | Implemented locally; QA pending |
| Pack evaluation/training | Earlier L001–L006 fixtures and test paths documented | Reconcile golden grader, holdout, GEPA and gated compiled registry | Needs verification / planned |
| Login/Register placeholder, billing, multi-Hive, exports | Login/Register UI now explicitly planned; other prototype-only screens | Authentication backend and true multi-Hive operations require separate approval | Login UI proposed; backend and extras deferred |
| Deployment | Oracle `2aa41e1` services started and connected to Inngest | UI changes uncommitted; build, browser QA, controlled deploy | Earlier runtime live; new UI not deployed |

## A. Product entry, case creation and intake

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| A01 | Maintain public landing and upload experience (`/`) | **Frozen / existing** | No visual/behavior changes in current UI migration |
| A02 | Login/Register visual placeholder; existing auth/session guardrails | **Placeholder planned; backend frozen** | No new auth APIs, sessions, passwords, or bypass; preserve all existing protection |
| A03 | Upload originals with owner authorization and immutable source identity | Existing path; needs E2E verification | Same storage/authorization and file continuity |
| A04 | Intake Evidence Workspace and document dispositions | Existing; frozen table | Add/remove and `Build my hive` actions preserved |
| A05 | Record domain intent and select compatible pack/version | Proposed contract review | No domain-specific branching in Core |
| A06 | Create Hive screen / rename / true multi-Hive list | **Create screen proposed; multi-Hive backend deferred** | Existing `/case` is single-case backed; no invented list API or fake persistence |
| A07 | Persist clear document/run statuses and supported recovery | Partial | UI reflects actual statuses, not timers |
| A08 | Intake agent determines next evidence/request screen | Agentic Plan target; **not qualified** | Validated UI tree + pack evidence requirement gate |
| A09 | Intake agent tool budget, document requests, user-answer events | Planned | No unlimited actions, provenance for decisions |


## A.1. Onboarding-to-Hive workflow (2026-10-17) — UX APPROVED FOR PLANNING; IMPLEMENTATION NOT AUTHORIZED

**Product intent:** Preserve the current public landing/upload design, but plan for its Upload action to lead into a coherent Login/Register placeholder → Create/Choose Hive → Documents journey. **The Login/Register screen is strictly UI-only in this iteration. No new authentication backend, sessions, password processing, or auth callbacks are authorized.** Existing authorization must continue to protect every real create/upload/read operation. This flow is not implemented by UI Phases 1–4; implementation needs separate approval. A06 is proposed for review, not complete.

### Terminology and storage decision

- **Hive:** user-visible *logical private workspace/case*, identified by an immutable internal `hiveId`/case ID, belonging to an authenticated owner. The display name is editable and is not a filesystem or bucket name.
- **Storage bucket:** infrastructure-level private object container, reused across many Hives. The current system references **Supabase Storage** and immutable source documents; do **not** infer that each Hive is a new AWS S3 bucket. Supabase Storage may support S3-compatible access, but this is an adapter detail to verify in the repo, not a product contract.
- **Suggested private object key (illustrative, NOT deployed):** `owners/{ownerId}/hives/{hiveId}/sources/{sourceDocumentId}/{objectVersionOrSafeFilename}`. Use opaque IDs, not Hive names or child/student names, in keys. Preserve the actual existing bucket names and key builder unless a separately approved storage migration is required.
- **Database source of truth:** authorized Hive membership/owner, intake/evidence run, immutable source-document record, storage key, content hash, and processing state. A UI display name should never grant access to objects; enforce RLS and signed/private access on the server.

### Intended happy path (stateful, not hardcoded stage timers)

**Planned visual journey:** `Public landing → Upload clicked → Login/Register placeholder (if signed out) → Create/Choose Hive → Documents / Your files → Raw extractions → Canonical Study → Writer → Customer/Pro report`.

**Real-operation boundary:** The placeholder may support explicitly labeled prototype-only continuation, but **it cannot authenticate a user, create a server session, grant access, or let a signed-out visitor call protected Hive/upload APIs.** Existing authenticated users may proceed through the currently supported secure backend path. If signed out, live creation/upload remains gated until real auth integration is separately implemented. No simulated data should be persisted as if real.

**File selection handoff:** Clicking Upload on the frozen landing page may precede actual file selection or upload; audit the current behavior first. **Never start anonymous network upload.** If chosen files cannot safely survive a placeholder-screen transition, ask users to select them again once they reach an authorized Hive workspace. Do not store private documents in localStorage, URL parameters, or a public temporary bucket.

| Ticket | Subtask / UI state | Status | Required behavior / acceptance |
|---|---|---|---|
| FLOW-01 | Inventory existing `/` Upload CTA and login/signup redirects | **Audit needed** | Map the real route, user session check, and upload timing; do not modify the frozen landing layout |
| FLOW-02 | Upload click: existing session check and placeholder handoff | **Proposed UI; backend unchanged** | Signed-out users see Login/Register placeholder; already-authenticated users follow existing secure path; no anonymous upload |
| FLOW-03 | Login / Register placeholder screens and transitions | **UI-only proposed; real auth deferred** | Display sign-in/sign-up, back/cancel, and clearly labeled preview continuation if needed; NO password handling, verification, token, session, callback, fake login, or bypass of protected operations |
| FLOW-04 | Create Your Hive screen | **Proposed; backend review required** | Name and supported domain; prototype-only create state must not claim persistence; real creation uses existing authenticated backend if supported and separately approved |
| FLOW-05 | Existing-user Hive choice | **Proposed; backend capability unverified** | If Hive exists, choose it or create a new one; do not present fake Hive cards on current single-case API |
| FLOW-06 | Create-Hive server operation and owner checks | **Deferred pending separate backend approval** | Investigate existing cases/nests first; no new server operation, auth bypass, or schema change during placeholder UI implementation |
| FLOW-07 | Create-Hive confirmation and recovery screens | **UI proposed; real success gated** | Simulated preview must be marked demo; live success only after actual authorized persistence response |
| FLOW-08 | Source upload bound to selected `hiveId` | **Existing behavior to audit; new backend deferred** | Authorized private upload only, tied to real persisted Hive/case ID; never rely on mutable Hive name or demo state |
| FLOW-09 | Original file retention and naming | **Existing capability; mapping audit** | Preserve immutable IDs, bytes/hash and original display filename; document removal handled by existing authorized path |
| FLOW-10 | Documents / Your files inventory | **P1 product gap observed in production** | Uploaded files appear with filename, type (if known), upload time, and actual per-document processing state; no empty management-only panel |
| FLOW-11 | Reader scheduling and live statuses | **P0 diagnosis** | Trace upload → run enqueue → worker → persisted status → GET progress → 2.5s UI poll; identify why uploaded files stay `Waiting` |
| FLOW-12 | Raw Extractions subview | **P1 redesign wiring** | Only actual extracted data displayed grouped beneath its source document, with evidence references; incomplete extraction is indicated |
| FLOW-13 | Unified workspace navigation and legacy route audit | **P1 audit** | Single Documents → Canonical Study → Reports journey; preserve legacy deep links via redirects only after mapping dependents |
| FLOW-14 | Canonical Study gate/reuse | **Existing path; E2E not verified** | No study action before required extraction readiness; unchanged inputs reuse accepted study; regenerate only on intentional action |
| FLOW-15 | Report generation from accepted study | **Existing Writer path; E2E not verified** | Each explicit Generate gets a new `writerRunId`; Customer/Pro UI trees have validated citations; old accepted report retained on failure |
| FLOW-16 | Multi-Hive list, rename and archival policy | **Proposed, separate approval** | Ownership, access, states, rename independent of storage; archival/delete semantics specified before exposing controls |
| FLOW-17 | Storage and privacy/security review | **Required gate** | Confirm actual Supabase bucket/key paths, signed URLs, RLS, file limits, antivirus policy, cross-owner isolation and external-model policy |
| FLOW-18 | End-to-end real synthetic IEP test | **Pending; authenticated path only for now** | Use real authenticated test session for Hive/files → Reader → Study → Writer; separately test signed-out placeholder UX without pretending an end-to-end authenticated flow works |

### Screen-by-screen UX contract

| Screen/state | Show | Primary action | Important transition |
|---|---|---|---|
| Public landing (frozen) | Existing current design | Upload | Auth status check, not data processing |
| Login / Register (only if signed out) | **New visual placeholder only**, login/register tabs and back navigation | Demo preview / Return | Does not create a session or unlock protected operations; real authentication integration deferred |
| Create / Choose Hive | Simple name/domain choice; existing Hives only where supported | Create Hive / Continue | Demo preview stays nonpersistent; live upload requires existing authenticated owner and persisted Hive ID |
| Upload into Hive | Selected Hive name, selected files, errors | Upload documents | Bind source records to correct Hive and owner |
| Documents — Your files | All real uploaded documents and actual status | Add documents or view extraction | Immediately visible even while Reader is waiting |
| Documents — Raw extractions | Extracted facts per original file, provenance | View evidence / Go to Study | Empty/processing when not yet extracted; no fake rows |
| Canonical Study | Readiness or accepted study | Build / View study | Reuse semantics remain backend-controlled |
| Reports | Real Writer status and accepted Customer/Pro tree | Generate / View report | No generated report on navigation alone |

### Open architecture and product decisions (must be resolved before Cursor code)

1. **Existing workspace storage:** Does current case/nest already represent a Hive, or do we need a first-class Hive table/API and multi-Hive ownership? Inspect schema and routes before proposing migrations.
2. **Upload CTA intent:** Does clicking Upload merely open file selection, or trigger a protected upload operation? Define the auth gate without redesigning `/`.
3. **First-time vs repeat users:** Automatically open the only existing Hive, or always show an explicit choose/create screen? Proposed: prompt first-time creation; existing users can choose.
4. **Authentication deferral:** Do not build email verification, password reset, callbacks, token/session creation, or fake signed-in state. Preserve existing security boundaries; plan real return-to-flow/session handling as a later separately approved ticket.
5. **Domain/pack selection:** Verify supported domains and version locking; do not imply more domains are ready because a prototype shows choices.
6. **Storage provider abstraction:** Continue existing Supabase Storage integration; no per-Hive buckets and no S3 migration without separately approved necessity.
7. **Billing:** No checkout/upgrade gate until an actual price/access API and policy are approved.
8. **Current scope boundary:** Continue IEP Domain Pack v0.2 review only; this expanded workflow is documented for later prioritization. No implementation authorization here.

### Definition of done for this workflow (future ticket gate)

**Current UX-only milestone:** A signed-out visitor can click Upload and see the Login/Register placeholder, switch visual states and return without backend authentication or bypass. A demo continuation, if included, is explicitly labeled and cannot execute protected operations. The landing page appearance remains unchanged.

**Later functional milestone (separate approval):** An actually authenticated user can create/select an owned Hive, upload files, see them in **Your files** and view verified **Raw extractions**. Real Reader statuses, study reuse, Writer provenance, refresh/recovery, and cross-Hive authorization must be tested end to end. Placeholder screens do not qualify as completion of this milestone.

## B. Document discovery, Reader agent and per-document extraction

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| R01 | Source file registration and page-numbered text/word positions | Existing | Input immutable, page coverage traceable |
| R02 | Document classification (type, dates, authority, relationships) | Existing path; pack alignment review | Model proposals validated, uncertainty retained |
| R03 | Export/load declarative pack snapshot for model instructions | Agentic target; needs verification | Stable pack version and prompt/schema agreement |
| R04 | Single-document evidence boundary for each extraction call | **Proposed** | Current document pages only; manifest for context |
| R05 | Reader tools: `list_documents`, `read_pages`, `search` | Reader service reported; precise coverage unverified | Tool scope, budgets, trace, no hidden evidence |
| R06 | Reader `propose_fact` / optional `propose_facts` shape | Existing Reader path; contract review | Typed candidates, sourceDocumentId, page, quote, modality |
| R07 | Inline call to TypeScript verifier | Existing verifier listener (Oracle port 4319) | Python must not independently accept its own facts |
| R08 | Deterministic proposal v4 validation | Existing validator path | No unsupported facts accepted |
| R09 | Image-only evidence and region-locator policy | Proposed review | Never claim verbatim quote where none verified |
| R10 | Exhaustive document-type checklist / repeat-row extraction | **IEP v0.2 review** | No missing goal/service rows; keys and quote provenance |
| R11 | Entity labels and ambiguous matching | Proposed review | No fabricated stable IDs; unresolved stays unresolved |
| R12 | Prompt v4.1 alignment and cache/baseline | Historical T0.1–T0.3; **needs reconciliation** | Read current branch before marking Done |
| R13 | Reader shadow vs baseline qualification across fixtures | Planned / partial | Compare equal full-case targets, precision/recall/provenance |
| R14 | Reader failure, abstention, timeout, spend caps | Needs verification | Fail closed, traceable, safe retries |

## C. Canonical Study / deterministic case synthesis

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| C01 | Canonical Study generation and existing reuse/idempotency | Existing; UI preserved | Reuse same study when input/version unchanged |
| C02 | Validate candidate facts independently of model prose | Existing path | No chip, no claim |
| C03 | Resolve identities, time windows, source/currentness | Existing primitives; proposed modernization | Preserve uncertainty and raw original facts |
| C04 | Compose operative-as-of facts and amendment supersession | **Proposed domain-neutral primitive review** | Code not domain-specific; never overwrite history |
| C05 | Compare compatible measures: change vs conflicting assertions | Proposed review | Unit, entity, period, modality aligned |
| C06 | Generate series, arithmetic and coverage with derivation chips | Proposed review | Derivations cite validated operands |
| C07 | Apply sourced conditional missing-document requirements | **IEP pack v0.2 review** | Distinguish missing, not applicable, not provided |
| C08 | Insight checks yield neutral evidence-backed questions | Partial rule infrastructure; review | No legal or medical verdicts |
| C09 | Persist accepted canonical report/projections | Existing | Immutable/traceable accepted artifact |
| C10 | Show actual study queue/processing/success/failure | **UI Phase 3 implemented locally** | 11 focused tests reported passing |
| C11 | Build confirmation and currently accepted fallback | **UI Phase 3 implemented locally** | Does not replace prior accepted study on failure |
| C12 | Accurate document-changed/staleness detection in API | **Parked / unsupported now** | Never calculate speculative client-side state |
| C13 | Domain portability test (IEP → Medicaid/bankruptcy) | Proposed acceptance | Identical Core with new declarative pack only |

## D. Domain Pack v0.2 and Domain Forge review

Nine logical sections of the proposed pack contract: **audience, document types, fact types, requirements, insight checks, plain explainers, reading notes, vocabulary, reference tables**.

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| P01 | Inventory existing IEP pack and identify versioned source of truth | **Current architecture review scope** | Document current vs proposed contracts |
| P02 | Define single declarative `DomainPack` typed contract | Proposed; approval needed | No arbitrary executable pack hooks |
| P03 | IEP document taxonomy (initial, annual, amendment, progress, evaluations, referral/consent) | Proposed review | Dates, relationships, authority represented |
| P04 | Reusable fact types (goal, baseline, target, measurement, service, minutes etc.) | Proposed review | Defined once across document checklists |
| P05 | Field provenance policy: quoted / derived / classified | Proposed review | Verified source chains and modalities |
| P06 | Document-specific exhaustive checklists | Proposed review | No blind broad prompt expectation |
| P07 | Applicable legal references and conditional requirements | Proposed review | Source and effective-date scoped; neutral claims |
| P08 | Audience terminology and presentation rules | Proposed review | Layperson/Pro slots not hardwired to IEP |
| P09 | Versioned source tables and reference provenance | Proposed review | Jurisdiction, validity periods and citations |
| P10 | Pack registration, conformance and compatibility tests | Planned | Core unchanged by installing another pack |
| P11 | Domain Forge certification workflow | Existing concept; separate scope | Remains parked unless explicitly commissioned |

## E. Investigator and Meaning agent

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| I01 | Run deterministic primitives/rulebook to flag possible gaps | Existing rule infrastructure | Every flag tied to documented rule/data |
| I02 | Implement DSPy Investigator module | Agentic Plan Phase 6 target; **not confirmed complete** | Investigates flagged evidence only |
| I03 | Use Reader-style tools to confirm facts or searched-page gaps | Planned | Absence claims include pages searched |
| I04 | Send confirmed proposals through same TypeScript verifier | Planned | No second Python verifier |
| I05 | Measure false gaps on holdouts vs rule-only baseline | Planned | Improvement gate; abstain on uncertainty |
| I06 | Meaning stage converts validated facts into audience-aware language | Proposed architecture | IDs resolve; no new factual assertions |
| I07 | Apply neutral-question/tone rules and ban verdicts | Existing checks; review | Questions, not unsupported judgments |

## F. Writer agent, validation gate and Inverted UI

| ID | Subtask | Status | Acceptance / note |
|---|---|---|---|
| W01 | Distinct explicit Writer run (`writerRunId`) per Generate | **Implemented, earlier commit `466b0ee`** | Same study may have many independent Writer runs |
| W02 | App POST and status poll by `writerRunId` | **Implemented, earlier commit `2aa41e1`** | Polling routes unchanged; no duplicate runs on navigation |
| W03 | Writer service available in Oracle `hive-agents` | **Operational startup confirmed** | `/health` 200; actual end-to-end paid call not yet proven |
| W04 | Writer reads accepted validated study only | Existing target; code-level review needed | No source-free new facts |
| W05 | Writer generates dynamic component UI tree by audience | Existing writer-shadow path; **partial qualification** | Different valid trees yield materially different layouts |
| W06 | UI tree uses supported shared schema/component catalog | Existing code path; needs final contract review | Unknown types/IDs rejected |
| W07 | Deterministic UI gate: required items, resolvable IDs, tone, evidence | Existing claim; full gate regression review needed | Fail closed, fallback allowed |
| W08 | Validated accepted UI tree persisted/retrieved for preview | Existing route; latest accepted only | Keep prior accepted on new failure |
| W09 | Customer and Pro trees independent in composition | **UI Phase 4 locally implemented, final QA pending** | Not static templates; same validated underlying facts |
| W10 | `HiveUiRenderer` renders tree, never invents content | **UI Phase 4 locally implemented, final QA pending** | Consistent components across varied trees |
| W11 | Writer queued/processing/accepted/rejected/failed UI | **UI Phase 4 locally implemented** | Real statuses, retry via explicit new run |
| W12 | Deterministic report view remains separate fallback | Existing, preserved | Not masquerading as Writer output |
| W13 | Report history of all accepted versions | **Parked / unsupported by current list API** | Do not fabricate archives |
| W14 | Full fact-chip provenance through report | Partially shown, interactive drawer **parked UI-5** | All visible assertions trace to evidence |
| W15 | Writer offline metric / GEPA refinement and holdout | Agentic Plan Phase 8 target; needs verification | Gate on required items, lead rules, tone, grounding |
| W16 | Entire intake screen as dynamically generated UI tree | Agentic Plan target; **not part of UI-1–4** | Requires separate agent/action flow approval |

**Architectural tension to reconcile:** AGENTIC-PLAN v1.1 targets inverted screens throughout intake and no fixed tabs; the current product UI migration intentionally preserves **Documents / Canonical Study / Reports** as stable workflow navigation and keeps landing/intake frozen. Neither silently supersedes the other. Any move to wholly agent-composed intake screens needs explicit product and architecture approval.

## G. UI migration (separate numbering: UI-1 through UI-6)

| ID | Subtask | Status | Validation |
|---|---|---|---|
| UI01 | Global app chrome, My Hives/case crumb, workspace tabs | **Implemented locally** | Cursor: 15/15 tests, TypeScript passed |
| UI02 | Documents cards, raw extractions, status/expansion, real polls | **Implemented locally** | Cursor: 12/12 tests, TypeScript passed |
| UI03 | Canonical Study ready/intro/confirm/process/fail/accepted | **Implemented locally** | Cursor: 11 tests, TypeScript passed |
| UI04 | Inverted Customer/Pro Writer presentation and renderer styling | **Implemented locally; final QA pending** | Cursor: 36/36 combined tests, TypeScript passed |
| UI05 | Evidence interactions, source drawer/PDF and confirms | **PARKED, not started** | No dummy PDF or quote content |
| UI06 | Cross-device/browser accessibility and responsive QA | **PARKED, not started** | 390/820/1440 + keyboard/touch |
| UI07 | Landing/front upload redesign | **Explicitly out of scope / frozen** | `app/src/app/page.tsx` unchanged |
| UI08 | Account/billing/multi-Hive/pro-purchase from prototype | **Parked / unsupported** | Require separately approved backend capabilities |

## H. Evaluation, training, and quality gates (Agentic Plan 0–8)

| Original phase | Subtasks / tickets | Status known today |
|---|---|---|
| 0: v4.1 prompt + caching + baseline | T0.1 prompt/schema; T0.2 baseline; T0.3 Anthropic prefix cache | **Historical NEXT: T0.1 in progress; needs Git reconciliation** |
| 1: golden set + grader | T1.1 `engine/eval`; T1.2 fixtures; T1.3 grader; T1.4 CLI scores; T1.5 endpoint | **Historical NEXT: not started; user later worked on T1.2, but no final closure evidence here** |
| 2: pack → DSPy definition | `study.agents`, export `agents.json`, snapshot tests | Partial/existing pack files; exact ticket status not verified |
| 3: DSPy Reader service | `agents/`, tools, verifier listener, Docker, trace | **Service and verifier operationally observed**; phase-wide qualification not verified |
| 4: Reader shadow worker integration | shadow Inngest step, validator, labeled persistence, side-by-side compare | Needs verification; a running Reader does not prove target shadow comparisons |
| 5: GEPA pack training & registry | `train.py`, holdout gate, pinned program registry/storage, fingerprints | Planned / no completion proof |
| 6: Investigator | agent, verifier, page-search gaps, grader | Planned / no completion proof |
| 7: Agentic intake and runtime switch | per-agent steps, dynamic intake, fallbacks, costs | Planned / no completion proof |
| 8: Writer and inverted dual persona | pack catalog, UI gate, Writer, renderer, training | **Writer/UI foundation exists**, but full Phase 8 target not proven; recent UI-4 is **not** Agentic Phase 8 closure |

### Golden/evaluation acceptance checklist

- Frozen synthetic and adversarial case sets (L001–L007 + injected-text tripwire) with typed target facts.
- Single TypeScript truth for page/quote/field verification; separate proposal shape, provenance, extraction value, entity matching, and case composition scores.
- Report precision/recall/abstention/unsupported claim rate and false-gap rate by corpus; compare matched workloads and evidence constraints.
- Writer tree tests: two different layouts; lead/required-item rules; unknown component rejection; invalid/missing IDs; every narrative statement grounded; preserved prior accepted tree on failure.
- Paid model calls and training only with explicit approval and cost bounds; baseline/version registry must be reproducible.

## I. Security, ownership, reliability and operations

| ID | Subtask | Status | Note |
|---|---|---|---|
| O01 | Keep Supabase authorization, storage, RLS and case access stable | Existing; verify on deployment | Never expose uploaded private records |
| O02 | Model data boundary, PII/PHI external-provider policy | **Needs explicit policy confirmation** | Do not infer consent or external-processing authorization from a service being configured |
| O03 | Worker and agents on Oracle ARM64 using Docker Compose | **Operational startup confirmed** | Oracle earlier checkout commit `2aa41e1` |
| O04 | Inngest worker `ACTIVE`, `WORKER_READY` | **Observed** | Actual Writer run success still not shown |
| O05 | Secrets remain in env store, not repo/preview artifacts | Existing deployment rule | No secrets in logs or exported design |
| O06 | Prompt-injection defenses and untrusted-document isolation | Proposed guardrail; audit pending | Documents and pack annotations never control system behavior |
| O07 | Error paths, retries and prior accepted artifact retention | Existing behaviors; partial testing | Do not erase accepted output on failure |
| O08 | Auth, RLS, evidence and report regression suite | Needs full e2e QA | Browser permissions and source links |
| O09 | Controlled migration/deployment and rollback | **Not performed for UI-1–4** | Checkpoint application files before publish |
| O10 | No unauthorized model calls, billing actions or schema changes | Current guardrail | Approval required for implementation beyond UI scope |

## J. Release/checkpoint sequence — NOT AUTHORIZED YET

1. Inspect local Git diff and new files: ensure **UI-1–4** changes, tests and CSS are intact; protect untracked Phase 3 files.
2. Keep `brain/**`, `design-reference/**`, and `phase-8.4-review.patch` separate from application checkpoint unless expressly approved.
3. Run focused Vitest, app TypeScript, production build, and scope review; log known Writer/source-interaction limitations.
4. Request approval for a narrowly staged checkpoint commit; do not automatically commit/push.
5. Separately approve Vercel deployment, smoke test navigation/Writer with consent to incur model cost, then approve subsequent rollout.
6. Keep UI-5 and UI-6 parked until the user resumes them. Do not auto-start billing, pack migration, agent training, or dynamic intake redesign.

## K. Decisions required before expanding scope

1. **Architecture:** formally reconcile `HIVE-ARCHITECTURE-V2-PROPOSED.md` and `AGENTIC-PLAN.md` v1.1, preserving historical plans; specify whether stable workspace navigation remains or all post-upload screens become agent-composed.
2. **IEP v0.2:** approve typed contract and document/fact checklist design before implementation.
3. **Agentic tracker:** inspect live branch and update T0.1–T8 statuses from actual merged code and measured tests, not filenames or recollection.
4. **Operational:** verify actual end-to-end Writer result and data handling policy before production use on sensitive uploads.
5. **Parked:** resume UI-5 evidence interactions and UI-6 responsive QA only when specifically requested.

---

**Invariant summary:** *Model proposes, Pack defines, Code validates, Professional decides.* **No chip, no claim. No validated claim, no narrative statement. Hive Core remains domain-agnostic.**

## L. 2026-10-17 release and production observations (supersedes older deployment row only)

- UI migration commits **`5a28bae`** (Phases UI-1–4) and **`bd6ac31`** (filename mapping) were pushed to `origin/refactor/engine-boundary`.
- User screenshots from the new production UI show **Waiting** on multiple Raw Extractions documents, while **Your files** contains only a management link rather than the inventory. These are **open P0/P1 issues**, not proven Reader failures.
- Local `pnpm --filter @hiveforyou/app typecheck` and `build` passed; focused tests passed. Earlier full app suite had **24 failures** with unresolved baseline attribution.
- Oracle worker/agents previously showed healthy Inngest connection; this does not establish live end-to-end processing success for the affected run.
- **UI-5 evidence drawer interactions and UI-6 responsive QA remain PARKED.**
- No authorization to change authentication, storage schema, code, deployment or run paid models in response to this document update.

## M. Decision update — 2026-10-17: Login/Register placeholder only

- **Approved for planning:** Visual Login/Register placeholder in the upload-to-Hive journey; design continuation states without real login.
- **Not approved for implementation by this document:** Changes to the app, authentication backends, protected APIs, sessions, database/storage, or existing authorizations.
- **Security constraint:** A placeholder may never impersonate authentication or allow a signed-out visitor to create a real Hive, upload files, or view private content.
- **Implementation order when separately approved:** (1) audit landing Upload click and existing session/route behavior, (2) placeholder UI only, (3) Create/Choose Hive UX mapped to actual backend capabilities, (4) live file inventory/status corrections, (5) controlled authenticated IEP end-to-end test.
- **Still parked:** UI-5 evidence interactions and UI-6 responsive QA.
