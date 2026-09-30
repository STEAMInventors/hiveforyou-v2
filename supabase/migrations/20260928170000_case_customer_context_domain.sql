-- Customer assertions are domain-scoped.
-- One active row per (case_id, domain_id, context_type). History stays via superseded_at.
-- The supersede-only trigger rejects any update that leaves superseded_at null,
-- so it is disabled only for the domain_id backfill.

alter table hive.case_customer_context
  disable trigger case_customer_context_reject_mutation;

alter table hive.case_customer_context
  add column if not exists domain_id text;

update hive.case_customer_context
  set domain_id = ''
  where domain_id is null;

alter table hive.case_customer_context
  alter column domain_id set not null;

alter table hive.case_customer_context
  enable trigger case_customer_context_reject_mutation;

drop index if exists hive.case_customer_context_active_uniq;
drop index if exists public.case_customer_context_active_uniq;

create unique index if not exists case_customer_context_active_uniq
  on hive.case_customer_context (case_id, domain_id, context_type)
  where superseded_at is null;

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
    or old.domain_id is distinct from new.domain_id
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
