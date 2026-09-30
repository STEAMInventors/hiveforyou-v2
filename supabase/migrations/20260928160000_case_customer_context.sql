-- Case-level customer context (objective, share intent, intended audience).
-- Append-only values with supersession — one active row per (case_id, context_type).

create table if not exists hive.case_customer_context (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),

  context_type text not null,
  value_json jsonb not null,
  source text not null default 'CUSTOMER_ASSERTION',

  created_at timestamptz not null default now(),
  superseded_at timestamptz,

  constraint case_customer_context_type_check check (
    context_type in ('OBJECTIVE', 'SHARE_INTENT', 'INTENDED_AUDIENCE')
  ),
  constraint case_customer_context_source_check check (
    source = 'CUSTOMER_ASSERTION'
  )
);

create unique index if not exists case_customer_context_active_uniq
  on hive.case_customer_context (case_id, context_type)
  where superseded_at is null;

create index if not exists case_customer_context_case_idx
  on hive.case_customer_context (case_id, context_type, created_at desc);

create index if not exists case_customer_context_user_case_idx
  on hive.case_customer_context (user_id, case_id);

create or replace function hive.case_customer_context_allow_supersede_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'row is immutable';
  end if;
  if old.id is distinct from new.id
    or old.user_id is distinct from new.user_id
    or old.case_id is distinct from new.case_id
    or old.context_type is distinct from new.context_type
    or old.value_json is distinct from new.value_json
    or old.source is distinct from new.source
    or old.created_at is distinct from new.created_at
  then
    raise exception 'only superseded_at may change';
  end if;
  if new.superseded_at is null then
    raise exception 'superseded_at must be set on update';
  end if;
  return new;
end;
$$;

drop trigger if exists case_customer_context_reject_mutation on hive.case_customer_context;
create trigger case_customer_context_reject_mutation
  before update or delete on hive.case_customer_context
  for each row
  execute function hive.case_customer_context_allow_supersede_only();

alter table hive.case_customer_context enable row level security;

grant select, insert, update on hive.case_customer_context to authenticated;
grant all on hive.case_customer_context to service_role;

drop policy if exists case_customer_context_select_own on hive.case_customer_context;
create policy case_customer_context_select_own on hive.case_customer_context
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists case_customer_context_insert_own on hive.case_customer_context;
create policy case_customer_context_insert_own on hive.case_customer_context
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists case_customer_context_update_own on hive.case_customer_context;
create policy case_customer_context_update_own on hive.case_customer_context
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
