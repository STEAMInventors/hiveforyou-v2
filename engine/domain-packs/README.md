# Domain Packs

Domain Packs contain domain knowledge. Hive Core contains orchestration.

## Governing law

Model proposes.  
Pack defines.  
Code validates.  
Professional decides.

## Separation

| Location | Owns |
|----------|------|
| `packages/domain-pack` (`@hiveforyou/domain-pack`) | Generic contracts and the registry runtime: how a pack is described, registered, and read. No IEP, Medicaid, or Bankruptcy rules. |
| `domain-packs/iep` | IEP knowledge: document types, interpreter, evidence requirements, vocabulary. |
| `domain-packs/medicaid` | Medicaid knowledge, when it exists. Today this is a manifest only. |
| `domain-packs/bankruptcy` | Bankruptcy knowledge, when it exists. Today this is a manifest only. |
| `domain-packs/registry` (`@hiveforyou/domain-packs`) | The one authoritative registry. This is the only module that imports pack implementations. |

Hive Core must not import `@hiveforyou/domain-pack-iep`, `@hiveforyou/domain-pack-medicaid`, or `@hiveforyou/domain-pack-bankruptcy`.

The registry exposes generic metadata for each pack:

```text
{ id, name, description, version, status, capabilities }
```

That metadata is what the front page, Intake menu, Jev routing, and Hive execution should use. Do not keep a second domain list in the UI, Jev, Intake, or Core.

Adding a certified pack is:

1. Add `domain-packs/<new-domain>/` with its knowledge.
2. Register and certify it in `domain-packs/registry`.
3. Hive UI, Jev, and execution pick it up from the registry.

## Workspace

`pnpm-workspace.yaml` includes `domain-packs/*`, so each pack and the registry are workspace packages alongside `packages/*` and `apps/*`.

Extraction of file bytes into text stays in `@hiveforyou/intake`. It is domain-independent. Domain interpretation of that text belongs in the pack.
