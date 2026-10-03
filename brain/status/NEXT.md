# Next milestone — authorized scope only



Status: **Slice 4.5 complete.** **Next:** Slice 5 — minimal human decision / conflict interaction.



**Authoritative design:** [engine-2-canonical-case.md](../architecture/engine-2-canonical-case.md); story writer supersedes template-only `composeNarrative` for customer-facing story prose.



## Authorized sequence



1. **Slice 1 (done):** Intake Evidence Workspace → `POST /api/intake/runs/[intakeRunId]/study` → `runCanonicalStudy` v4 with intake-backed structure map + frozen context.

2. **Slice 2 (done):** Claim → evidenceRef → logical document → source → page/span/bbox/text (no chip → no claim end-to-end).

3. **Slice 3 (done):** Deterministic `case-map/1` projection from `CanonicalCaseSnapshot` + pack projection guidance.

4. **Slice 4 (done):** Living Case Map UI + inverted lifecycle + accessible outline.

5. **Slice 4b (done):** Pack **`story`** block; deterministic **`buildSkeleton`** from **`Study`**; generic **`storyPrompt`**; **`validateStory`**; **`generateStory`** orchestrator (fixture + optional second OpenAI call); **`validatedStory`** on **`case-view/2`**; Hive story tab renders validated prose + fact chips only.

6. **Slice 4.5 (done):** **Rulebook document explainers** in the Hive parent view — per domain pack, one nav tab per in-case logical document that has a reviewed **`DocumentGuide`** (`getGuide`); render human-authored guide copy from **`domain-packs/<id>/rulebook/guides/*.ts`** joined to validated case-view facts (no runtime model paraphrase of rulebook text). Builder: **`buildRulebookDocumentExplainers`** (`@hiveforyou/core/rulebook-explainers`, client-safe subpath). UI: **`HiveCaseDocumentExplainerView`** + dynamic **`doc:<logicalDocumentId>`** tabs after Story/Plan/Timeline/Meeting prep.

7. **Slice 5:** Minimal human decision / conflict interaction.

8. **Slice 6:** Real L001 model study qualification (qualitative acceptance only).



## Slice 4.5 constraints

- Rulebook **text** stays pack-authored and reviewed; runtime code **joins** guides to validated claims only.

- New document types get explainers by adding a **`DocumentGuide`** under the pack rulebook (and optional slot/measure mapping in the builder), not by hardcoding in Hive Core.

- Client bundles import **`@hiveforyou/core/rulebook-explainers`** only — not the **`@hiveforyou/core`** barrel (server persistence pulls **`node:crypto`**).

- Follow-ups inside 4.5 (not blocking 5): progress-report and other IEP guides; fuller **slot** interpolation; pack-owned section↔fact mapping beyond IEP anatomy shim.



## Slice 4b constraints



- Do **not** change extraction, classification, comparison engines, or anchor selection in intake/study engines.

- **`buildSkeleton`** consumes **`Study`** fields only; extend **`buildPackStudyFromCaseProjection`** (adapter) to populate anchor refs, series, gaps, comparisons, and signal — no new comparison logic in skeleton.

- Template **`packNarrative`** remains for tests; UI prefers **`validatedStory`** when present.

- Second model call only for story writer when `HIVE_STORY_WRITER_ENGINE=openai`; canonical study remains one call.



## Frozen



- Engine 1 Intake/Discover unless Engine 2 exposes a genuine provenance defect.

- Customer/Pro long-form report milestones (outside case map story tab).



Do not implement beyond the authorized slice without explicit approval.

