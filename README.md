# HiveForYou V2

**Evidence → Intelligence → Understanding**

HiveForYou is a domain-agnostic evidence-to-case-intelligence platform. Users upload documents; Hive discovers what was uploaded, asks focused questions, builds canonical context, validates structured intelligence, and delivers interactive customer and professional experiences from the same truth.

## Repository structure

| Path | Purpose |
|------|---------|
| `app` | Next.js UI + thin API (`@hiveforyou/app`) |
| `engine/core` | Hive core / engines (`@hiveforyou/core`) |
| `engine/intake` | Upload & intake (`@hiveforyou/intake`) |
| `engine/canonical` | Canonical model & persistence |
| `engine/domain-pack` | Generic Domain Pack contracts and registry runtime |
| `engine/domain-packs/` | Domain knowledge (IEP, Medicaid, Bankruptcy) and the one pack registry |
| `engine/shared` | Shared contracts & types |
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
