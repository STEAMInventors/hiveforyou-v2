# DP-02 — Mapping Pack migration and compatibility

**Branch:** `refactor/engine-boundary`
**Date:** 2026-10-18
**Contract:** `hive.domain-mapping-pack/1.0` (four sections: Concepts, Documents, Relationships, Personas)

## Authority (single mapping pack compiler)

| Legacy surface | Owner during transition | DP-02 disposition |
|----------------|-------------------------|-------------------|
| IEP declarative v0.2.1 JSON (`engine/domain-packs/iep/v0.2.1/`) | **Primary migration source for IEP** | Adapted in-memory to four-section canonical; digest = declarative content SHA-256 |
| Native Generic pack (`engine/domain-packs/generic/v1.0.0/`) | **Generic fallback authority** | Native four-section JSON; compiled through same resolver/compiler |
| Registry `DomainPack` TS (`engine/domain-packs/*/pack.ts`) | **Production Discover/intake today** | Unchanged in DP-02; mapping pack does not replace registry runtime until DP-03 |
| `compileDeclarativePackToProposal` / normalizer / reasoner context | **Stage view compilers** | Invoked from `compileMappingPackStageViews` via reconstructed declarative raw — not a second pack authority |
| `study-agents/1`, brain proposal snapshots | Reader qualification / pins | Retained; Personas mapped from declarative `audience.json` until agents.json consolidation |
| `packs-v2/*.yaml` | Validation-only experiments | Not wired; candidate import in future pack versions — no parallel runtime authority |
| Medicaid/Bankruptcy TS packs | Discover scaffold | Mapping resolver falls back to **Generic** (no declarative registration); Medicaid TS discover profile unchanged |

## Resolution order

1. **Pinned pack** (`resolvePinnedMappingPack`) — fail-closed on missing pack or digest mismatch.
2. **Domain known + registered specialized** — highest eligible semver (IEP: prerelease allowed when caller sets `allowPrerelease: true`).
3. **Unknown / unresolved domain or no specialized registration** — Generic pack (`generic@1.0.0`).
4. **Invalid specialized registration only** — explicit error (see `fixture-malformed`).

## Stage views (compiled, not production-wired in DP-02)

Discover, Reader, Normalizer, Reasoner, Validator, Writer, Application — each carries identical `packPin` (`packId`, `packVersion`, `contentDigest`).

**Entrypoint:** `@hiveforyou/domain-packs/mapping-pack` and re-exports on `@hiveforyou/domain-packs/declarative`.

## Registry test policy (Medicaid)

Medicaid retains draft **Notice of Action** discover profile in TS registry (scaffold, not certified mapping pack). Bankruptcy remains generic-only. See `registry/tests/registry.test.ts`.

## Qualification

```powershell
cd C:\Users\abhattacharyya\hiveforyou-v2
pnpm hive:test --stage pack
pnpm --filter @hiveforyou/domain-packs test
```
