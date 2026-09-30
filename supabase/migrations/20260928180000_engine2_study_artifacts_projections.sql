-- Engine 2: raw study proposals and immutable case projections.

create table if not exists hive.study_artifacts (
  id uuid primary key default gen_random_uuid(),
  study_run_id uuid not null unique references hive.study_runs (id),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  raw_proposal_json jsonb,
  validation_result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists hive.case_projections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  intelligence_version integer not null,
  projection_kind text not null,
  schema_version text not null,
  projection_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint case_projections_kind_check check (projection_kind in ('customer', 'pro')),
  unique (case_id, intelligence_version, projection_kind)
);

create index if not exists study_artifacts_run_idx on hive.study_artifacts (study_run_id);
create index if not exists case_projections_case_version_idx
  on hive.case_projections (case_id, intelligence_version);

drop trigger if exists study_artifacts_reject_mutation on hive.study_artifacts;
create trigger study_artifacts_reject_mutation
  before update or delete on hive.study_artifacts
  for each row execute function hive.reject_mutation();

drop trigger if exists case_projections_reject_mutation on hive.case_projections;
create trigger case_projections_reject_mutation
  before update or delete on hive.case_projections
  for each row execute function hive.reject_mutation();

alter table hive.study_artifacts enable row level security;
alter table hive.case_projections enable row level security;

grant select, insert on hive.study_artifacts to authenticated;
grant select, insert on hive.case_projections to authenticated;
grant all on hive.study_artifacts to service_role;
grant all on hive.case_projections to service_role;

drop policy if exists study_artifacts_select_own on hive.study_artifacts;
create policy study_artifacts_select_own on hive.study_artifacts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists study_artifacts_insert_own on hive.study_artifacts;
create policy study_artifacts_insert_own on hive.study_artifacts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists case_projections_select_own on hive.case_projections;
create policy case_projections_select_own on hive.case_projections
  for select to authenticated using (user_id = auth.uid());

drop policy if exists case_projections_insert_own on hive.case_projections;
create policy case_projections_insert_own on hive.case_projections
  for insert to authenticated with check (user_id = auth.uid());
