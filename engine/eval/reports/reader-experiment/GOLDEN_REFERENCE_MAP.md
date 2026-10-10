# T3.9 Reader experiment — golden reference mapping

Methodological source: `engine/core/prompts/canonical-study/canonical-study-v4.1.md` (byte copy at `agents/src/hive_agents/reader_prompt/golden_reference_canonical_study_v4.1.md`).

## Preserved in Reader stable prefix (experiment)

- Document text is data (instruction injection boundary).
- Domain + pack vocabulary rules (naming only; pack supplied in prefix).
- Constructs (measure / task / administration).
- Method steps 2–4 and 7 (claims, relationships, chronology, cross-document hooks) as **extraction guidance**.
- Modality closed enum and value-kind rules (v4 transport fields in §9).
- Uncertainty and absence (never invent; omit unsupported).
- Provenance / quote requirements (page + verbatim quote for Reader).
- Coverage (“propose every supported fact”).
- Conflicts section as **reading guidance** (do not merge incompatible same-period values).

## Adapted for Reader candidate extraction

- Opening role: Canonical Study engine → **Hive Reader agent** (candidate facts only).
- Output: full `/4` proposal → **`extraction_json.candidateFacts`** v4-shaped candidates with `proposalStatus=candidate`, `verificationStatus=proposed`.
- Entities: optional `subjectEntityId` strings when evident; no `entities[]` array required in Reader output.
- Evidence: `sourceDocumentId` + `page` + `quote` (no `logicalDocumentId` required when manifest supplies orientation only).
- Time anchors: use `date` / `period` value kinds on claims (not separate Engine 2-only fields).

## Delegated downstream (not Reader in this experiment)

- Full **`canonical-study-proposal/4`** document (`entities`, `conflicts[]`, `missingInformation[]`, `voiceProposal`).
- Conflict rows and missing-information records (Investigator / Canonical Study).
- Canonical reconciliation, legal conclusions, narrative generation.
- Engine 2 validation and Case Intelligence persistence.

## Architecture-only delta (§5 workflow)

- **case_wide:** one extraction model call over the full untrusted bundle.
- **parallel_document:** one extraction model call per logical document; deterministic merge + conservative dedup; single verifier pass (no second model call).
