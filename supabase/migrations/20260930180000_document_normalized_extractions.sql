-- Full NestIEP-equivalent normalized extraction artifact (one row per source document + content hash).

create table if not exists hive.document_normalized_extractions (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  source_document_id uuid not null references hive.source_documents (id),
  source_hash text not null,
  schema_version text not null,
  normalized_extraction jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_document_id, source_hash)
);

create index if not exists document_normalized_extractions_source_idx
  on hive.document_normalized_extractions (source_document_id, source_hash);

alter table hive.document_normalized_extractions enable row level security;

grant select, insert on hive.document_normalized_extractions to authenticated;
grant all on hive.document_normalized_extractions to service_role;

drop policy if exists document_normalized_extractions_select_own on hive.document_normalized_extractions;
create policy document_normalized_extractions_select_own on hive.document_normalized_extractions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists document_normalized_extractions_insert_own on hive.document_normalized_extractions;
create policy document_normalized_extractions_insert_own on hive.document_normalized_extractions
  for insert to authenticated
  with check (user_id = auth.uid());
