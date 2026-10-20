-- Immutable Domain Pack registry: digest-keyed snapshots, explicit activation (no auto-newest).

create table if not exists hive.domain_pack_registry (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null,
  pack_id text not null,
  pack_version text not null,
  content_sha256 text not null,
  snapshot_storage_bucket text not null,
  snapshot_storage_path text not null,
  lifecycle_status text not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint domain_pack_registry_content_sha256_check check (
    content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint domain_pack_registry_lifecycle_check check (
    lifecycle_status in ('DRAFT', 'CERTIFIED', 'RETIRED')
  ),
  constraint domain_pack_registry_active_requires_certified check (
    not is_active or lifecycle_status = 'CERTIFIED'
  ),
  constraint domain_pack_registry_activated_at_when_active check (
    (not is_active and activated_at is null) or (is_active and activated_at is not null)
  ),
  unique (content_sha256)
);

create unique index if not exists domain_pack_registry_one_active_certified_per_domain
  on hive.domain_pack_registry (domain_id)
  where is_active = true and lifecycle_status = 'CERTIFIED';

create index if not exists domain_pack_registry_domain_idx
  on hive.domain_pack_registry (domain_id, lifecycle_status);

alter table hive.domain_pack_registry enable row level security;

grant select on hive.domain_pack_registry to authenticated;
grant all on hive.domain_pack_registry to service_role;

drop policy if exists domain_pack_registry_select_all on hive.domain_pack_registry;
create policy domain_pack_registry_select_all on hive.domain_pack_registry
  for select to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('domain-pack-snapshots', 'domain-pack-snapshots', false)
on conflict (id) do update set public = false;

-- Reversible activation: service_role only; never auto-selects newest digest.
create or replace function hive.activate_domain_pack_registry_entry(p_content_sha256 text)
returns hive.domain_pack_registry
language plpgsql
security definer
set search_path = hive, public
as $$
declare
  target hive.domain_pack_registry;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'DOMAIN_PACK_REGISTRY_ACTIVATION_UNAUTHORIZED';
  end if;

  select *
  into target
  from hive.domain_pack_registry
  where content_sha256 = lower(trim(p_content_sha256))
  for update;

  if not found then
    raise exception 'DOMAIN_PACK_REGISTRY_ENTRY_NOT_FOUND';
  end if;

  if target.lifecycle_status <> 'CERTIFIED' then
    raise exception 'DOMAIN_PACK_REGISTRY_ACTIVATION_REQUIRES_CERTIFIED';
  end if;

  update hive.domain_pack_registry
  set is_active = false,
      activated_at = null
  where domain_id = target.domain_id
    and is_active = true;

  update hive.domain_pack_registry
  set is_active = true,
      activated_at = now()
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function hive.activate_domain_pack_registry_entry(text) from public;
grant execute on function hive.activate_domain_pack_registry_entry(text) to service_role;

-- IEP Reader proposal snapshots (immutable digests; neither activated by default).
insert into hive.domain_pack_registry (
  domain_id,
  pack_id,
  pack_version,
  content_sha256,
  snapshot_storage_bucket,
  snapshot_storage_path,
  lifecycle_status,
  is_active
)
values
  (
    'iep',
    'iep',
    '0.3.0-proposed',
    'c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775',
    'domain-pack-snapshots',
    'iep/c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775.json',
    'CERTIFIED',
    false
  ),
  (
    'iep',
    'iep',
    '0.3.0-proposed',
    'b1bafe209b771a10b55cebd3bf745e476e77e1bcaf3c3cf051aa022ef719f757',
    'domain-pack-snapshots',
    'iep/b1bafe209b771a10b55cebd3bf745e476e77e1bcaf3c3cf051aa022ef719f757.json',
    'DRAFT',
    false
  )
on conflict (content_sha256) do nothing;
