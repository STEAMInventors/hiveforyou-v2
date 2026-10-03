-- Intake document identity.
-- A source document is not owned by one intake run. Participation is
-- document_identities (intake_run_id, source_document_id).
-- hive.source_documents.intake_run_id stays a nullable compatibility column
-- and is not authoritative.

create table if not exists hive.intake_runs (
  id uuid primary key,
  case_id uuid not null references hive.cases (id),
  user_id uuid not null references auth.users (id),
  idempotency_key text not null,
  status text not null,
  classifier text not null,
  classifier_version text,
  started_at timestamptz not null,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_runs_status_check check (
    status in ('RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
  ),
  constraint intake_runs_classifier_check check (classifier = 'JEV'),
  unique (case_id, idempotency_key)
);

create table if not exists hive.document_identities (
  id uuid primary key,
  intake_run_id uuid not null references hive.intake_runs (id),
  source_document_id uuid not null references hive.source_documents (id),
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),
  processing_status text not null,
  proposed_type text,
  confidence numeric,
  proposed_by text,
  classifier_version text,
  returned_model text,
  classified_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_identities_status_check check (
    processing_status in (
      'UPLOADED',
      'EXTRACTING',
      'NEEDS_OCR',
      'CLASSIFYING',
      'CLASSIFIED',
      'NEEDS_REVIEW',
      'FAILED'
    )
  ),
  constraint document_identities_type_check check (
    proposed_type is null or proposed_type in (
      'bank_statement',
      'tax_return',
      'pay_stub',
      'bankruptcy_filing',
      'medicaid_document',
      'iep_document',
      'insurance_document',
      'certificate',
      'other'
    )
  ),
  constraint document_identities_proposal_check check (
    (
      processing_status in ('CLASSIFIED', 'NEEDS_REVIEW')
      and proposed_type is not null
      and confidence is not null
      and proposed_by = 'JEV'
    )
    or (
      processing_status not in ('CLASSIFIED', 'NEEDS_REVIEW')
      and proposed_type is null
      and confidence is null
    )
  ),
  constraint document_identities_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  unique (intake_run_id, source_document_id)
);

-- Page provenance for Live Evidence-Trace.
-- Identity of a row is source_document_id + page_number + extraction_method + source_hash.
-- bounding_boxes is reserved for a later OCR pass and is unused by native text.
create table if not exists hive.document_extractions (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  source_document_id uuid not null references hive.source_documents (id),
  page_number integer not null,
  extraction_method text not null,
  source_hash text not null,
  page_text text not null,
  bounding_boxes jsonb,
  created_at timestamptz not null default now(),
  constraint document_extractions_page_check check (page_number >= 1),
  unique (source_document_id, page_number, extraction_method, source_hash)
);

create index if not exists intake_runs_user_case_idx
  on hive.intake_runs (user_id, case_id);

create index if not exists document_identities_run_idx
  on hive.document_identities (intake_run_id);

create index if not exists document_extractions_source_hash_idx
  on hive.document_extractions (source_document_id, source_hash, extraction_method);

drop trigger if exists intake_runs_set_updated_at on hive.intake_runs;
create trigger intake_runs_set_updated_at
  before update on hive.intake_runs
  for each row execute function hive.set_updated_at();

drop trigger if exists document_identities_set_updated_at on hive.document_identities;
create trigger document_identities_set_updated_at
  before update on hive.document_identities
  for each row execute function hive.set_updated_at();

alter table hive.intake_runs enable row level security;
alter table hive.document_identities enable row level security;
alter table hive.document_extractions enable row level security;

grant select, insert, update on hive.intake_runs to authenticated;
grant select, insert, update on hive.document_identities to authenticated;
grant select, insert on hive.document_extractions to authenticated;
grant all on hive.intake_runs, hive.document_identities, hive.document_extractions to service_role;

drop policy if exists intake_runs_select_own on hive.intake_runs;
create policy intake_runs_select_own on hive.intake_runs
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists intake_runs_insert_own on hive.intake_runs;
create policy intake_runs_insert_own on hive.intake_runs
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists intake_runs_update_own on hive.intake_runs;
create policy intake_runs_update_own on hive.intake_runs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists document_identities_select_own on hive.document_identities;
create policy document_identities_select_own on hive.document_identities
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists document_identities_insert_own on hive.document_identities;
create policy document_identities_insert_own on hive.document_identities
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists document_identities_update_own on hive.document_identities;
create policy document_identities_update_own on hive.document_identities
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists document_extractions_select_own on hive.document_extractions;
create policy document_extractions_select_own on hive.document_extractions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists document_extractions_insert_own on hive.document_extractions;
create policy document_extractions_insert_own on hive.document_extractions
  for insert to authenticated
  with check (user_id = auth.uid());
