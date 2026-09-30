# Engine 1 Lessons (Legacy Qualification)

V2 is a **new implementation**. Prior Hive Engine 1 qualification established a proven **conceptual pipeline** — reference requirements, **not code to copy**.

## Pipeline stages

| ID | Stage |
|----|--------|
| L001 | VERIFY_SOURCES |
| L002 | DOMAIN_ROUTING |
| L003 | DOCUMENT_DISCOVERY |
| L004 | VALIDATE_PROPOSAL |
| L005 | VERIFY_DOMAIN_RESOLUTION |
| L006 | CHECK_COMPLETENESS |

Followed by **PERSIST_RESULT** in the overall Engine 1 responsibility set (see [engine-1.md](../architecture/engine-1.md)).

V2 may implement these responsibilities with clean architecture. Do not port V1 modules, migrations, or assumptions unless explicitly instructed.
