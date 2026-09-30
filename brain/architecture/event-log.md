# Event Log

Append-oriented record of **material state changes** and **processing runs** for audit and replay understanding.

## V2-001E

Study run events are stored in an **append-only `StudyRunEventRepository`**. The Supabase adapter inserts into `hive.study_run_events`; the table rejects updates and deletes. In-memory adapter remains for unit tests:

- `study_run.started`  
- `study_run.engine_completed`  
- `study_run.validation_completed`  
- `study_run.completed` / `study_run.failed`  

Events are **not** embedded only in a mutable run document; the run record holds summary fields, while the event repository holds the append-only stream.

Postgres stores the same port. Events are not a second truth layer.

Complements the canonical model; does not replace it.
