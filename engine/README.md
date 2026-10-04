# Engine

Processing layer for HiveForYou V2: PDF extraction, classification, model calls, validation, projections, and domain packs.

## Layout

| Path | Package |
|------|---------|
| `core/` | `@hiveforyou/core` |
| `intake/` | `@hiveforyou/intake` |
| `canonical/` | `@hiveforyou/canonical` |
| `shared/` | `@hiveforyou/shared` |
| `domain-pack/` | `@hiveforyou/domain-pack` |
| `domain-packs/` | Domain pack implementations + `@hiveforyou/domain-packs` registry |

## Boundaries

- **Must not** import `next/*`, `react`, or anything from `/app`.
- Entrypoints take **IDs and DTOs**, not HTTP request objects.
- UI communicates via Supabase rows (and later Inngest events).

## App

Next.js UI and thin API routes live in `/app`.
