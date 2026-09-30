-- Engine 1 discover runs and immutable artifacts.

create table if not exists hive.discover_runs (
  id uuid primary key,
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  idempotency_key text not null,
  engine_provider text not null,
  provider_mode text not null,
  model_id text,
  reasoning_effort text,
  prompt_id text not null,
  prompt_version text not null,
  prompt_sha256 text not null,
  domain_pack_id text not null,
  domain_pack_version text not null,
  status text not null,
  error_code text,
  error_message_safe text,
  started_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discover_runs_status_check check (
    status in ('RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
  ),
  constraint discover_runs_prompt_version_check check (prompt_version <> 'latest'),
  unique (case_id, idempotency_key)
);

create table if not exists hive.discover_artifacts (
  id uuid primary key default gen_random_uuid(),
  discover_run_id uuid not null unique references hive.discover_runs (id),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  raw_proposal_json jsonb,
  validation_result_json jsonb,
  discovery_result_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists discover_runs_case_idx on hive.discover_runs (case_id);
create index if not exists discover_runs_user_idx on hive.discover_runs (user_id);

drop trigger if exists discover_runs_set_updated_at on hive.discover_runs;
create trigger discover_runs_set_updated_at
  before update on hive.discover_runs
  for each row execute function hive.set_updated_at();

drop trigger if exists discover_artifacts_reject_mutation on hive.discover_artifacts;
create trigger discover_artifacts_reject_mutation
  before update or delete on hive.discover_artifacts
  for each row execute function hive.reject_mutation();

alter table hive.discover_runs enable row level security;
alter table hive.discover_artifacts enable row level security;

grant select, insert, update on hive.discover_runs to authenticated;
grant select, insert on hive.discover_artifacts to authenticated;

grant all on hive.discover_runs to service_role;
grant all on hive.discover_artifacts to service_role;

drop policy if exists discover_runs_select_own on hive.discover_runs;
create policy discover_runs_select_own on hive.discover_runs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists discover_runs_insert_own on hive.discover_runs;
create policy discover_runs_insert_own on hive.discover_runs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists discover_runs_update_own on hive.discover_runs;
create policy discover_runs_update_own on hive.discover_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists discover_artifacts_select_own on hive.discover_artifacts;
create policy discover_artifacts_select_own on hive.discover_artifacts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists discover_artifacts_insert_own on hive.discover_artifacts;
create policy discover_artifacts_insert_own on hive.discover_artifacts
  for insert to authenticated
  with check (user_id = auth.uid());
