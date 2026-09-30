-- Engine 1 adaptive discovery: questions, customer assertions, extended run status.

alter table hive.discover_runs
  add column if not exists intake_run_id uuid,
  add column if not exists phase text;

alter table hive.discover_runs drop constraint if exists discover_runs_status_check;

alter table hive.discover_runs
  add constraint discover_runs_status_check check (
    status in (
      'RUNNING',
      'SUCCEEDED',
      'NEEDS_REVIEW',
      'NEEDS_DISCOVERY_INPUT',
      'NEEDS_EVIDENCE_INPUT',
      'READY_FOR_STUDY',
      'FAILED'
    )
  );

alter table hive.discover_artifacts
  add column if not exists structure_map_json jsonb,
  add column if not exists discovery_assessment_json jsonb,
  add column if not exists resolution_proposal_json jsonb;

-- Adaptive discover merges phase outputs into the same artifact row.
drop trigger if exists discover_artifacts_reject_mutation on hive.discover_artifacts;
create trigger discover_artifacts_reject_mutation
  before delete on hive.discover_artifacts
  for each row execute function hive.reject_mutation();

grant update on hive.discover_artifacts to authenticated;
grant update on hive.discover_artifacts to service_role;

create table if not exists hive.discover_questions (
  id uuid primary key,
  discover_run_id uuid not null references hive.discover_runs (id),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  question_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists discover_questions_run_idx
  on hive.discover_questions (discover_run_id);

create table if not exists hive.discover_customer_answers (
  id uuid primary key default gen_random_uuid(),
  discover_run_id uuid not null references hive.discover_runs (id),
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  question_id uuid not null,
  evidence_kind text not null default 'CUSTOMER_ASSERTION',
  answer_json jsonb not null,
  intake_run_id uuid,
  answered_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint discover_customer_answers_evidence_kind_check check (
    evidence_kind = 'CUSTOMER_ASSERTION'
  )
);

create index if not exists discover_customer_answers_run_idx
  on hive.discover_customer_answers (discover_run_id, answered_at desc);

alter table hive.discover_questions enable row level security;
alter table hive.discover_customer_answers enable row level security;

grant select, insert on hive.discover_questions to authenticated;
grant select, insert on hive.discover_customer_answers to authenticated;
grant all on hive.discover_questions to service_role;
grant all on hive.discover_customer_answers to service_role;

drop policy if exists discover_questions_select_own on hive.discover_questions;
create policy discover_questions_select_own on hive.discover_questions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists discover_questions_insert_own on hive.discover_questions;
create policy discover_questions_insert_own on hive.discover_questions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists discover_customer_answers_select_own on hive.discover_customer_answers;
create policy discover_customer_answers_select_own on hive.discover_customer_answers
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists discover_customer_answers_insert_own on hive.discover_customer_answers;
create policy discover_customer_answers_insert_own on hive.discover_customer_answers
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists discover_artifacts_update_own on hive.discover_artifacts;
create policy discover_artifacts_update_own on hive.discover_artifacts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
