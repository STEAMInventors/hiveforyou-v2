-- Append-only audit trail for agentic Reader invocations (one row per lifecycle event).

create table if not exists hive.agent_run_trace_events (
  id uuid primary key,
  study_run_id uuid not null references hive.study_runs (id) on delete cascade,
  attempt_id uuid not null,
  sequence_number integer not null check (sequence_number >= 0),
  user_id uuid not null references auth.users (id) on delete cascade,
  case_id uuid not null references hive.cases (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'STARTED',
      'TOOL_CALLED',
      'FACT_PROPOSED',
      'EVIDENCE_ACCEPTED',
      'EVIDENCE_REJECTED',
      'COMPLETED',
      'FAILED'
    )
  ),
  occurred_at timestamptz not null,
  domain_id text not null,
  domain_pack_id text not null,
  domain_pack_version text not null,
  model_id text,
  source_document_ids jsonb not null default '[]'::jsonb,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (attempt_id, sequence_number)
);

create index if not exists agent_run_trace_events_study_run_idx
  on hive.agent_run_trace_events (study_run_id, occurred_at asc);

create index if not exists agent_run_trace_events_attempt_idx
  on hive.agent_run_trace_events (attempt_id, sequence_number asc);

drop trigger if exists agent_run_trace_events_reject_mutation on hive.agent_run_trace_events;
create trigger agent_run_trace_events_reject_mutation
  before update or delete on hive.agent_run_trace_events
  for each row execute function hive.reject_mutation();

alter table hive.agent_run_trace_events enable row level security;

grant select, insert on hive.agent_run_trace_events to authenticated;
grant all on hive.agent_run_trace_events to service_role;

drop policy if exists agent_run_trace_events_select_own on hive.agent_run_trace_events;
create policy agent_run_trace_events_select_own on hive.agent_run_trace_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists agent_run_trace_events_insert_own on hive.agent_run_trace_events;
create policy agent_run_trace_events_insert_own on hive.agent_run_trace_events
  for insert to authenticated
  with check (user_id = auth.uid());
