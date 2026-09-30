-- Hive persistence: private document storage, case/run records, immutable study artifacts.
-- Apply on a fresh Supabase project (auth + storage schemas are required).

create schema if not exists hive;

grant usage on schema hive to postgres, anon, authenticated, service_role;

create or replace function hive.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function hive.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'row is immutable';
end;
$$;

create table if not exists hive.cases (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  domain_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hive.answer_snapshots (
  id uuid primary key,
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  question_set_id text not null,
  snapshot_json jsonb not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  unique (case_id, snapshot_hash)
);

create table if not exists hive.source_documents (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),
  intake_run_id uuid,
  study_run_id uuid,
  client_staged_id text,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_bucket text not null,
  storage_path text not null,
  sha256 text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_documents_status_check check (status in ('stored')),
  unique (case_id, client_staged_id)
);

create table if not exists hive.study_runs (
  id uuid primary key,
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  idempotency_key text not null,
  study_context_version text not null,
  study_context_id uuid,
  domain_id text not null,
  domain_pack_id text not null,
  domain_pack_version text not null,
  engine_provider text not null,
  provider_mode text not null,
  prompt_id text not null,
  prompt_version text not null,
  prompt_sha256 text not null,
  question_set_version text not null,
  answer_snapshot_hash text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  error_message_safe text,
  validation_result_json jsonb,
  case_intelligence_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_runs_status_check check (
    status in ('RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
  ),
  constraint study_runs_prompt_version_check check (prompt_version <> 'latest'),
  unique (case_id, idempotency_key)
);

create table if not exists hive.study_contexts (
  id uuid primary key,
  study_run_id uuid not null unique references hive.study_runs (id),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  schema_version text not null,
  context_json jsonb not null,
  context_hash text not null,
  answer_snapshot_id uuid references hive.answer_snapshots (id),
  answer_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table hive.source_documents
  drop constraint if exists source_documents_study_run_id_fkey;

alter table hive.source_documents
  add constraint source_documents_study_run_id_fkey
  foreign key (study_run_id) references hive.study_runs (id);

create table if not exists hive.study_run_events (
  id uuid primary key,
  study_run_id uuid not null references hive.study_runs (id),
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists hive.case_intelligence_snapshots (
  id uuid primary key,
  case_id uuid not null references hive.cases (id),
  study_run_id uuid not null references hive.study_runs (id),
  user_id uuid not null references auth.users (id),
  version integer not null,
  schema_version text not null,
  intelligence_json jsonb not null,
  validation_result_json jsonb not null,
  domain_pack_id text not null,
  domain_pack_version text not null,
  created_at timestamptz not null default now(),
  unique (case_id, version)
);

create index if not exists source_documents_user_case_idx
  on hive.source_documents (user_id, case_id);

create index if not exists study_runs_user_idx
  on hive.study_runs (user_id);

create index if not exists study_runs_case_idx
  on hive.study_runs (case_id);

create index if not exists study_run_events_run_idx
  on hive.study_run_events (study_run_id);

create index if not exists case_intelligence_case_version_idx
  on hive.case_intelligence_snapshots (case_id, version);

create index if not exists answer_snapshots_case_idx
  on hive.answer_snapshots (case_id, created_at desc);

drop trigger if exists cases_set_updated_at on hive.cases;
create trigger cases_set_updated_at
  before update on hive.cases
  for each row execute function hive.set_updated_at();

drop trigger if exists source_documents_set_updated_at on hive.source_documents;
create trigger source_documents_set_updated_at
  before update on hive.source_documents
  for each row execute function hive.set_updated_at();

drop trigger if exists study_runs_set_updated_at on hive.study_runs;
create trigger study_runs_set_updated_at
  before update on hive.study_runs
  for each row execute function hive.set_updated_at();

drop trigger if exists study_contexts_reject_mutation on hive.study_contexts;
create trigger study_contexts_reject_mutation
  before update or delete on hive.study_contexts
  for each row execute function hive.reject_mutation();

drop trigger if exists study_run_events_reject_mutation on hive.study_run_events;
create trigger study_run_events_reject_mutation
  before update or delete on hive.study_run_events
  for each row execute function hive.reject_mutation();

drop trigger if exists case_intelligence_reject_mutation on hive.case_intelligence_snapshots;
create trigger case_intelligence_reject_mutation
  before update or delete on hive.case_intelligence_snapshots
  for each row execute function hive.reject_mutation();

drop trigger if exists answer_snapshots_reject_mutation on hive.answer_snapshots;
create trigger answer_snapshots_reject_mutation
  before update or delete on hive.answer_snapshots
  for each row execute function hive.reject_mutation();

alter table hive.cases enable row level security;
alter table hive.source_documents enable row level security;
alter table hive.study_runs enable row level security;
alter table hive.study_contexts enable row level security;
alter table hive.study_run_events enable row level security;
alter table hive.case_intelligence_snapshots enable row level security;
alter table hive.answer_snapshots enable row level security;

grant select, insert, update on hive.cases to authenticated;
grant select, insert, update on hive.source_documents to authenticated;
grant select, insert, update on hive.study_runs to authenticated;
grant select, insert on hive.study_contexts to authenticated;
grant select, insert on hive.study_run_events to authenticated;
grant select, insert on hive.case_intelligence_snapshots to authenticated;
grant select, insert on hive.answer_snapshots to authenticated;

grant all on all tables in schema hive to service_role;

drop policy if exists cases_select_own on hive.cases;
create policy cases_select_own on hive.cases
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists cases_insert_own on hive.cases;
create policy cases_insert_own on hive.cases
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists cases_update_own on hive.cases;
create policy cases_update_own on hive.cases
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists source_documents_select_own on hive.source_documents;
create policy source_documents_select_own on hive.source_documents
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists source_documents_insert_own on hive.source_documents;
create policy source_documents_insert_own on hive.source_documents
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists source_documents_update_own on hive.source_documents;
create policy source_documents_update_own on hive.source_documents
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists study_runs_select_own on hive.study_runs;
create policy study_runs_select_own on hive.study_runs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists study_runs_insert_own on hive.study_runs;
create policy study_runs_insert_own on hive.study_runs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists study_runs_update_own on hive.study_runs;
create policy study_runs_update_own on hive.study_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists study_contexts_select_own on hive.study_contexts;
create policy study_contexts_select_own on hive.study_contexts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists study_contexts_insert_own on hive.study_contexts;
create policy study_contexts_insert_own on hive.study_contexts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists study_run_events_select_own on hive.study_run_events;
create policy study_run_events_select_own on hive.study_run_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists study_run_events_insert_own on hive.study_run_events;
create policy study_run_events_insert_own on hive.study_run_events
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists case_intelligence_select_own on hive.case_intelligence_snapshots;
create policy case_intelligence_select_own on hive.case_intelligence_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists case_intelligence_insert_own on hive.case_intelligence_snapshots;
create policy case_intelligence_insert_own on hive.case_intelligence_snapshots
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists answer_snapshots_select_own on hive.answer_snapshots;
create policy answer_snapshots_select_own on hive.answer_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists answer_snapshots_insert_own on hive.answer_snapshots;
create policy answer_snapshots_insert_own on hive.answer_snapshots
  for insert to authenticated
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do update set public = false;

drop policy if exists case_documents_select_own on storage.objects;
create policy case_documents_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists case_documents_insert_own on storage.objects;
create policy case_documents_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists case_documents_update_own on storage.objects;
create policy case_documents_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists case_documents_delete_own on storage.objects;
create policy case_documents_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
