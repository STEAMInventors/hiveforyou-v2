# Domain Packs

Domain Packs contain domain knowledge. Hive Core contains orchestration.

Governing law:

**Model proposes. Pack defines. Code validates. Professional decides.**

Hive Core loads packs through **one** Domain Pack registry. It does not hardcode IEP, Medicaid, or Bankruptcy rules, and it does not keep a second domain list for the UI, Jev, or Intake.

## Layout

| Path | Package | Role |
|------|---------|------|
| `packages/domain-pack` | `@hiveforyou/domain-pack` | Generic contracts and registry runtime. No domain rules. |
| `domain-packs/registry` | `@hiveforyou/domain-packs` | The only registration site. Imports pack packages and registers them. |
| `domain-packs/iep` | `@hiveforyou/domain-pack-iep` | IEP knowledge. |
| `domain-packs/medicaid` | `@hiveforyou/domain-pack-medicaid` | Manifest only until Medicaid rules exist. |
| `domain-packs/bankruptcy` | `@hiveforyou/domain-pack-bankruptcy` | Manifest only until Bankruptcy rules exist. |

Workspace: `pnpm-workspace.yaml` includes `domain-packs/*` as well as `packages/*` and `apps/*`.

## Registry metadata

The registry exposes this public metadata for every registered pack:

```text
{ id, name, description, version, status, capabilities }
```

`status` is `scaffold` or `certified`. Capabilities (such as `intake.work-purpose` and `discover`) are how the UI, Intake, and engines decide what a pack can do. Adding a pack is: create `domain-packs/<id>/`, then register it in `domain-packs/registry`. Do not add a parallel list in Core, the web menu, Intake, or Jev.

## Pack status

| Domain | Code | Status |
|--------|------|--------|
| IEP | [iep.md](iep.md) · `domain-packs/iep` | Discover vocabulary, audience roles, and evidence requirements ported from the former `packages/domain-packs` scaffold. Not certified. |
| Medicaid | [medicaid.md](medicaid.md) · `domain-packs/medicaid` | Manifest only. No document rules. |
| Bankruptcy | [bankruptcy.md](bankruptcy.md) · `domain-packs/bankruptcy` | Manifest only. No document rules. |

Extraction stays in `@hiveforyou/intake`. It is domain-independent. IEP document interpretation that is not extraction lives under `domain-packs/iep/`.
