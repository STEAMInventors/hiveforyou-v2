# DP-03A — Discover Mapping Pack qualification

**Branch:** `refactor/engine-boundary`
**Date:** 2026-10-18
**Scope:** Discover consumes compiled **Document Profiles** discover view (qualification path only; production Discover unchanged)

## Result: **PASS**

## PowerShell commands (from repo root)

```powershell
pnpm hive:test --stage pack
pnpm hive:test --stage discover --case L001
pnpm hive:test --stage discover --case bankruptcy
pnpm hive:test --stage discover --case unknown
pnpm --filter @hiveforyou/domain-packs test
pnpm --filter @hiveforyou/core exec vitest run src/discover/discover.test.ts src/discover/compose-discover-prompt-inputs.test.ts
git diff --check
```

## Gate results

| Gate | Result |
|------|--------|
| `pnpm hive:test --stage pack` | **PASS** (15 tests) |
| `pnpm hive:test --stage discover --case L001` | **PASS** |
| `pnpm hive:test --stage discover --case bankruptcy` | **PASS** |
| `pnpm hive:test --stage discover --case unknown` | **PASS** |
| `@hiveforyou/domain-packs` | **PASS** (76/76) |
| Discover regression (`discover.test.ts`, `compose-discover-prompt-inputs.test.ts`) | **PASS** (15/15) |
| `git diff --check` | **PASS** |
| New environment variables | **None** |
| Paid model calls | **None** |

## Pack pins (Discover qualification)

| Case | packId | packVersion | contentDigest | selection |
|------|--------|-------------|---------------|-----------|
| L001 (IEP) | `iep` | `0.2.1-draft` | `5b88a3ab391223899682b3d865d103ec593aad129e7e7ec8ddcfe8ea218c9dc6` | specialized |
| bankruptcy / unknown | `generic` | `1.0.0` | `cb0384154a9249baa3f13eeea2bd42ef03f6e24ee90002067d31202ff61d7113` | generic_fallback |

Discover view schema: `hive.mapping-pack-discover-view/1` (from DP-02 compiler).

## Files / functions changed

| Area | Path | Role |
|------|------|------|
| Mapping pack context | `engine/core/src/discover/mapping-pack/resolve-discover-mapping-pack-context.ts` | `resolveDiscoverMappingPackContext`, `resolveDiscoverMappingPackContextForQualificationCase` |
| View → snapshot | `engine/core/src/discover/mapping-pack/discover-view-to-snapshot.ts` | `discoverViewToPackSnapshot` (reuse structural validation + completeness types) |
| Prompt (qualification) | `engine/core/src/discover/mapping-pack/compose-discover-prompt-from-mapping-pack.ts` | `composeDiscoverPromptInputsFromMappingPack` |
| Validation + compliance | `engine/core/src/discover/mapping-pack/validate-discovery-proposal-mapping-pack.ts` | `validateDiscoveryProposalWithMappingPack`, `preserveUnlistedDocumentTypesForMappingPack` |
| Compliance record | `engine/core/src/discover/mapping-pack/build-discover-pack-compliance.ts` | `buildDiscoverPackCompliance` → `hive.discover-pack-compliance/1` |
| Fixtures | `engine/core/src/discover/mapping-pack/qualification-fixtures.ts` | Synthetic L001 / bankruptcy / unknown proposals + sources |
| CLI runner | `engine/core/src/discover/mapping-pack/run-discover-qualification-case.ts` | `runDiscoverQualificationCase`, `printDiscoverQualificationReport` |
| Tests | `engine/core/src/discover/mapping-pack/discover-mapping-pack.test.ts` | Mandatory DP-03A gates |
| Structural validator hook | `engine/core/src/discover/validate-structural-proposal.ts` | Optional `packByDomainId` override (default unchanged) |
| Harness | `scripts/hive-test.ts` | `--stage discover [--case …]` |

**Unchanged (production path):** `run-discover.ts`, OpenAI/fixture engines, API routes — still use legacy `listDiscoverDomainPacks()` / registry snapshots.

## Classification examples (L001 fixture)

| disposition | documentType | source | pages |
|-------------|--------------|--------|-------|
| accepted | Annual individualized education program | `l001-src-iep-001` | 1–42 |
| accepted | Psychoeducational evaluation report | `l001-src-eval-002` | 1–18 |

**Rejected example (unit test):** `Totally Fabricated Document Type XYZ` with `recognitionStatus: recognized` → `UNKNOWN_VOCABULARY` / compliance `rejected`.

**Unresolved:** non-pack labels with non-recognized status remain `proposed_type` / unresolved (no silent rewrite to unclassified).

## Regression

- `engine/core/src/discover/discover.test.ts` — **13/13 PASS**
- `engine/core/src/discover/compose-discover-prompt-inputs.test.ts` — **2/2 PASS**

## Remaining gaps (DP-03B / DP-03C / production)

- Production Discover routing does not call mapping-pack resolver or emit compliance artifacts.
- No live Discover model replay; fixtures only unless future `--live` authorization.
- Reader and Normalizer pack compliance not started (**DP-03B/C**).
- L001 fixture uses mapping-pack **profile labels** (v0.2.1), not legacy `iep/pack.ts` document type strings — intentional alignment with Document Profiles stage view.