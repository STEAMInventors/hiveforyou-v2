-- Shadow study evaluation artifacts (Pro-only; not customer truth).

create table if not exists hive.shadow_study_artifacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references hive.cases (id) on delete cascade,
  study_run_id uuid not null unique references hive.study_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  failed_step text,
  findings_json jsonb,
  statements_count integer not null default 0,
  facts_count integer not null default 0,
  multi_source_facts_count integer not null default 0,
  coverage_json jsonb,
  drops_json jsonb,
  token_usage_json jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists shadow_study_artifacts_case_idx
  on hive.shadow_study_artifacts (case_id, completed_at desc);

alter table hive.shadow_study_artifacts enable row level security;

grant select on hive.shadow_study_artifacts to authenticated;
grant all on hive.shadow_study_artifacts to service_role;

drop policy if exists shadow_study_artifacts_select_own on hive.shadow_study_artifacts;
create policy shadow_study_artifacts_select_own on hive.shadow_study_artifacts
  for select to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('document-pages', 'document-pages', false)
on conflict (id) do update set public = false;

drop policy if exists document_pages_select_own on storage.objects;
create policy document_pages_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_pages_insert_own on storage.objects;
create policy document_pages_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_pages_update_own on storage.objects;
create policy document_pages_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists document_pages_delete_own on storage.objects;
create policy document_pages_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
