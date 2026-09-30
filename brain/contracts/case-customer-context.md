# Contract — Case Customer Context

**Status:** Implemented

Persisted domain-level customer assertions in `hive.case_customer_context`:

| context_type | Purpose | Discovery | Engine 2 facts | Customer Report |
| --- | --- | --- | --- | --- |
| `OBJECTIVE` | Required customer goal | Call #1 emphasis | Analytical focus only | Emphasis |
| `SHARE_INTENT` | Optional sharing plan | No | No | Future sharing UX only |
| `INTENDED_AUDIENCE` | Optional role when sharing | No | No | Projection tone only |

`INTENDED_AUDIENCE.value_json` stores a stable `roleId`, the display `label`, and `domainPackId` / `domainPackVersion` (null on the generic list). `OTHER` also stores `otherRoleText`. The customer chooses from model suggestions for that domain, the Domain Pack `audienceRoles` list when the pack defines one, and generic choices such as Just for me / Someone else. Only the confirmed value is stored. Older rows may still contain `{ audience }` only. `domain_id` scopes every row; single-domain cases still store the resolved domain id.

- `source` = `CUSTOMER_ASSERTION`
- History preserved via `superseded_at`; one active row per `(case_id, domain_id, context_type)`
- Pro projection uses canonical intelligence only — not audience or share intent

Types: `@hiveforyou/shared/case-customer-context`
