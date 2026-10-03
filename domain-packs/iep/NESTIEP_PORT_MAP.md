# NestIEP → Hive IEP Domain Pack port map

## Authoritative source

| Field | Value |
|-------|--------|
| Repository | `https://github.com/STEAMInventors/NESTIEP.git` |
| Local path | `C:\Users\abhattacharyya\nestiep` |
| Commit (inspected) | `89b20b3b732d5da92df68431a25fdd32d8287a48` |

Hive does **not** vendor the NestIEP tree. Domain-specific code is **ported** into `domain-packs/iep/` only.

## Recovery / extraction (already in Hive Core — not re-ported)

| NestIEP concept | Hive location | Action |
|-----------------|---------------|--------|
| PDF/image recovery, quality gate, OCR | [`packages/intake/src/extraction/nestiep/`](../../packages/intake/src/extraction/nestiep/) | Already ported |
| `nestiep-recovered-document/1` schema | [`packages/shared/src/intake/normalized-extraction.ts`](../../packages/shared/src/intake/normalized-extraction.ts) | Contract |

## Domain document understanding (ported from NestIEP `lib/scan`)

| NestIEP source | Hive destination | Action |
|----------------|------------------|--------|
| `lib/scan/types.ts` (`SCAN_DOCUMENT_FAMILIES`, `ScanClassification`, page types) | `document-interpreter/contracts.ts` | Port enums + Hive disposition mapping |
| `lib/scan/title-candidate.ts` | `document-interpreter/title-candidate.ts` | Port (adapt `ScanDocument` input) |
| `lib/scan/classifier.ts` (`RULES`, `classifyDocumentLocally`, primary identity helpers) | `document-interpreter/classify-local.ts` | Port |
| `lib/scan/logical-segmentation.ts` | `document-interpreter/logical-segmentation.ts` | Full hybrid port: `packetSegmentationNeeded`, optional resolver, `validateLogicalBoundaries`, `applyLogicalSegmentation`, `segmentIepScanDocuments` |
| `lib/scan/semantic-adapters.ts` (`segmentPacket`) | `document-interpreter/semantic-segmentation-resolver.ts` + `@hiveforyou/domain-pack` `PacketSegmentationResolver` | Contract only — no in-repo NestIEP production resolver |
| Generic boundary validation | `packages/domain-pack/src/logical-page-segmentation.ts` | Deterministic page coverage (no domain vocabulary) |
| `lib/scan/logical-segmentation.ts` (legacy export) | `document-interpreter/split-logical-documents.ts` | Deprecated helpers |
| `lib/scan/evidence/ontology/process-lifecycle.ts` | — | Not needed for Intake document-understanding slice |
| `lib/scan/evidence/relationships/derive-structural-completeness.ts` | — | **Not** mapped to `missingExpectations` — checks §300.320 sections inside IEP documents, not missing uploads |
| Discover-shaped missing uploads | `evidence-requirements/requirements.ts` | **Empty** until an authoritative NestIEP/pack rule source exists (not document classification) |
| OpenAI model classification in scan orchestrator | — | **Not ported** — Engine 1 Intake uses deterministic local rules + `NEEDS_REVIEW` |

## L001–L006 qualification

| Stage | NestIEP reference | Hive |
|-------|-------------------|------|
| L001 | `lib/scan/__tests__/comparability.test.ts`, `date-roles.test.ts`, corpus under `nestiep-corpus/cases/L001/clean/` | First parity gate (`domain-packs/iep/scripts/l001-parity.mjs`) |
| L002–L006 | Same test folders (L002 Caleb fixtures, etc.) | Same parity approach after L001 — **not certification** |

## Semantic mapping (NestIEP → Hive Pack output)

| NestIEP `ScanDocumentFamily` | Hive `documentFamily` (Pack) |
|------------------------------|------------------------------|
| Same string enum where possible | `IEP`, `EVALUATION`, `PROGRESS`, `REFERRAL`, … |
| `OTHER` | `OTHER_EDUCATIONAL` when educational context; else generic `OTHER` |

| Hive `processingDisposition` | Rule |
|-----------------------------|------|
| `PROCESS` | Classified with sufficient confidence; not unrelated junk |
| `NEEDS_REVIEW` | Low confidence, ambiguous identity, or incompatible collection signals |
| `DO_NOT_PROCESS` | Unrelated/non-educational (e.g. generic Jev `bank_statement`) or explicit junk |
