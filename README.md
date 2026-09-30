# HiveForYou V2

**Evidence → Intelligence → Understanding**

HiveForYou is a domain-agnostic evidence-to-case-intelligence platform. Users upload documents; Hive discovers what was uploaded, asks focused questions, builds canonical context, validates structured intelligence, and delivers interactive customer and professional experiences from the same truth.

## Repository structure

| Path | Purpose |
|------|---------|
| `apps/web` | Next.js frontend (future) |
| `packages/core` | Hive core / engines (future) |
| `packages/intake` | Upload & intake (future) |
| `packages/canonical` | Canonical model & persistence (future) |
| `packages/domain-packs` | Domain-specific packs (future) |
| `packages/shared` | Shared contracts & types |
| `brain/` | Operational memory for agents — start at [`brain/INDEX.md`](brain/INDEX.md) |
| `supabase/migrations` | Postgres migrations (future) |
| `tests/` | Cross-package tests (future) |

## Workspace

Requires **Node 22+** and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm typecheck
```

Architecture, product definition, ADRs, and current work live in **`brain/`** — not duplicated here.
