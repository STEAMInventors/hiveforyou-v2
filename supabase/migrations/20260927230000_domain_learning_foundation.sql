-- V2-001E.1 Domain Learning Foundation: questions, answers, study snapshots, lineage, observations, candidates.

-- case_questions
create table if not exists hive.case_questions (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),
  study_run_id uuid references hive.study_runs (id),

  domain_id text not null,
  domain_pack_id text not null,
  domain_pack_version text not null,

  question_set_version text not null,

  question_key text not null,
  question_type text not null,

  wording_version text not null,
  question_text text not null,

  required boolean not null,

  trigger_type text not null,
  trigger_key text,
  trigger_metadata jsonb not null default '{}'::jsonb,

  affects_canonical_truth boolean not null,
  affects_analysis boolean not null,
  affects_projection boolean not null,

  created_at timestamptz not null default now(),

  constraint case_questions_trigger_type_check check (
    trigger_type in (
      'MISSING_EXPECTED_DOCUMENT',
      'AMBIGUOUS_DOCUMENT_IDENTITY',
      'AMBIGUOUS_RELATIONSHIP',
      'CHRONOLOGY_GAP',
      'MISSING_CONTEXT',
      'ANALYSIS_INTENT',
      'PACK_REQUIRED_CLARIFICATION',
      'OTHER'
    )
  )
);

create index if not exists case_questions_case_idx on hive.case_questions (case_id, question_key);
create index if not exists case_questions_user_case_idx on hive.case_questions (user_id, case_id);

create index if not exists case_questions_learning_idx
  on hive.case_questions (
    domain_id,
    domain_pack_version,
    question_key,
    trigger_type
  );

-- versioned answers (append-only)
create table if not exists hive.case_question_answers (
  id uuid primary key,
  question_id uuid not null references hive.case_questions (id),
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),

  answer_version integer not null,
  answer_value jsonb not null,

  disposition text,
  supersedes_answer_id uuid references hive.case_question_answers (id),

  answered_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (question_id, answer_version)
);

create index if not exists case_question_answers_question_idx
  on hive.case_question_answers (question_id, answer_version desc);

-- immutable study ↔ answer version binding
create table if not exists hive.study_run_question_answers (
  study_run_id uuid not null references hive.study_runs (id),
  question_id uuid not null references hive.case_questions (id),
  answer_id uuid not null references hive.case_question_answers (id),
  created_at timestamptz not null default now(),

  primary key (study_run_id, question_id)
);

create index if not exists study_run_question_answers_run_answer_idx
  on hive.study_run_question_answers (study_run_id, answer_id);

-- immutable study document set
create table if not exists hive.study_run_documents (
  study_run_id uuid not null references hive.study_runs (id),
  source_document_id uuid not null references hive.source_documents (id),
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),

  discovered_document_type text,
  discovered_role text,
  recognition_status text,

  relationship_metadata jsonb not null default '{}'::jsonb,
  included_in_study boolean not null,

  created_at timestamptz not null default now(),

  primary key (study_run_id, source_document_id)
);

create index if not exists study_run_documents_run_idx on hive.study_run_documents (study_run_id);

-- intelligence lineage
create table if not exists hive.intelligence_lineage (
  id uuid primary key,
  user_id uuid not null references auth.users (id),
  case_id uuid not null references hive.cases (id),
  study_run_id uuid not null references hive.study_runs (id),

  intelligence_item_type text not null,
  intelligence_item_id text not null,

  source_class text not null,

  source_document_id uuid references hive.source_documents (id),
  question_id uuid references hive.case_questions (id),
  answer_id uuid references hive.case_question_answers (id),
  parent_intelligence_item_id text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint intelligence_lineage_source_class_check check (
    source_class in (
      'DOCUMENT_EVIDENCE',
      'USER_CONTEXT',
      'USER_ASSERTION',
      'ANALYSIS_INTENT',
      'DERIVED'
    )
  ),
  constraint intelligence_lineage_user_assertion_no_document check (
    source_class <> 'USER_ASSERTION' or source_document_id is null
  ),
  constraint intelligence_lineage_analysis_intent_no_document check (
    source_class <> 'ANALYSIS_INTENT' or source_document_id is null
  ),
  constraint intelligence_lineage_document_evidence_requires_document check (
    source_class <> 'DOCUMENT_EVIDENCE'
    or source_document_id is not null
  ),
  constraint intelligence_lineage_user_assertion_requires_answer check (
    source_class <> 'USER_ASSERTION'
    or answer_id is not null
  ),
  constraint intelligence_lineage_analysis_intent_requires_answer check (
    source_class <> 'ANALYSIS_INTENT'
    or answer_id is not null
  ),
  constraint intelligence_lineage_derived_requires_parent check (
    source_class <> 'DERIVED'
    or parent_intelligence_item_id is not null
  )
);

create index if not exists intelligence_lineage_run_idx
  on hive.intelligence_lineage (study_run_id, intelligence_item_type);

create index if not exists intelligence_lineage_case_run_idx
  on hive.intelligence_lineage (case_id, study_run_id);

create index if not exists intelligence_lineage_question_idx
  on hive.intelligence_lineage (question_id, source_class)
  where question_id is not null;

create index if not exists intelligence_lineage_answer_idx
  on hive.intelligence_lineage (answer_id, source_class)
  where answer_id is not null;

-- domain learning observations (append-only, de-identified structured metadata)
create table if not exists hive.domain_learning_observations (
  id uuid primary key,
  domain_id text not null,
  domain_pack_id text not null,
  domain_pack_version text not null,

  case_id uuid not null references hive.cases (id),
  study_run_id uuid not null references hive.study_runs (id),

  observation_type text not null,
  subject_key text not null,

  observation_json jsonb not null default '{}'::jsonb,

  question_id uuid references hive.case_questions (id),
  answer_id uuid references hive.case_question_answers (id),
  source_document_id uuid references hive.source_documents (id),
  observation_schema_version text not null default '1',

  created_at timestamptz not null default now(),

  constraint domain_learning_observation_type_check check (
    observation_type in (
      'DOCUMENT_PRESENT',
      'DOCUMENT_EXPECTED_MISSING',
      'DOCUMENT_UNAVAILABLE',
      'DOCUMENT_NOT_APPLICABLE',
      'AMBIGUITY_FOUND',
      'QUESTION_ASKED',
      'QUESTION_ANSWERED',
      'AMBIGUITY_RESOLVED',
      'VALIDATED_CLAIM_CREATED',
      'CLAIM_REJECTED',
      'CONFLICT_FOUND',
      'HUMAN_ADJUDICATION_REQUIRED',
      'STUDY_SUCCEEDED',
      'STUDY_FAILED'
    )
  )
);

create index if not exists domain_learning_observations_domain_idx
  on hive.domain_learning_observations (domain_id, observation_type, subject_key);

create index if not exists domain_learning_observations_run_idx
  on hive.domain_learning_observations (study_run_id);

create index if not exists domain_learning_observations_domain_pack_type_idx
  on hive.domain_learning_observations (
    domain_id,
    domain_pack_version,
    observation_type
  );

create index if not exists domain_learning_observations_question_idx
  on hive.domain_learning_observations (question_id, observation_type)
  where question_id is not null;

create index if not exists domain_learning_observations_answer_idx
  on hive.domain_learning_observations (answer_id)
  where answer_id is not null;

create index if not exists domain_learning_observations_document_idx
  on hive.domain_learning_observations (source_document_id, observation_type)
  where source_document_id is not null;

-- learning candidates (human review path only)
create table if not exists hive.domain_learning_candidates (
  id uuid primary key,
  domain_id text not null,

  candidate_type text not null,
  subject_key text not null,

  proposed_learning jsonb not null default '{}'::jsonb,

  supporting_observation_count integer not null default 0,
  status text not null default 'PROPOSED',

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  certified_domain_pack_version text,
  source_domain_pack_id text,
  source_domain_pack_version text,

  constraint domain_learning_candidate_status_check check (
    status in ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CERTIFIED')
  )
);

create index if not exists domain_learning_candidates_domain_status_idx
  on hive.domain_learning_candidates (domain_id, status);

create index if not exists domain_learning_candidates_pack_idx
  on hive.domain_learning_candidates (
    domain_id,
    source_domain_pack_id,
    source_domain_pack_version,
    status
  );

create table if not exists hive.domain_learning_candidate_observations (
  candidate_id uuid not null references hive.domain_learning_candidates (id),
  observation_id uuid not null references hive.domain_learning_observations (id),

  primary key (candidate_id, observation_id)
);

-- append-only immutability
drop trigger if exists case_questions_reject_mutation on hive.case_questions;
create trigger case_questions_reject_mutation
  before update or delete on hive.case_questions
  for each row execute function hive.reject_mutation();

drop trigger if exists case_question_answers_reject_mutation on hive.case_question_answers;
create trigger case_question_answers_reject_mutation
  before update or delete on hive.case_question_answers
  for each row execute function hive.reject_mutation();

drop trigger if exists study_run_question_answers_reject_mutation on hive.study_run_question_answers;
create trigger study_run_question_answers_reject_mutation
  before update or delete on hive.study_run_question_answers
  for each row execute function hive.reject_mutation();

drop trigger if exists study_run_documents_reject_mutation on hive.study_run_documents;
create trigger study_run_documents_reject_mutation
  before update or delete on hive.study_run_documents
  for each row execute function hive.reject_mutation();

drop trigger if exists intelligence_lineage_reject_mutation on hive.intelligence_lineage;
create trigger intelligence_lineage_reject_mutation
  before update or delete on hive.intelligence_lineage
  for each row execute function hive.reject_mutation();

drop trigger if exists domain_learning_observations_reject_mutation on hive.domain_learning_observations;
create trigger domain_learning_observations_reject_mutation
  before update or delete on hive.domain_learning_observations
  for each row execute function hive.reject_mutation();

-- RLS: private case-linked tables (user-owned)
alter table hive.case_questions enable row level security;
alter table hive.case_question_answers enable row level security;
alter table hive.study_run_question_answers enable row level security;
alter table hive.study_run_documents enable row level security;
alter table hive.intelligence_lineage enable row level security;

alter table hive.domain_learning_observations enable row level security;
alter table hive.domain_learning_candidates enable row level security;
alter table hive.domain_learning_candidate_observations enable row level security;

grant select, insert on hive.case_questions to authenticated;
grant select, insert on hive.case_question_answers to authenticated;
grant select, insert on hive.study_run_question_answers to authenticated;
grant select, insert on hive.study_run_documents to authenticated;
grant select, insert on hive.intelligence_lineage to authenticated;

-- Learning infrastructure: no direct authenticated access (service-managed)
grant all on hive.domain_learning_observations to service_role;
grant all on hive.domain_learning_candidates to service_role;
grant all on hive.domain_learning_candidate_observations to service_role;
grant all on hive.case_questions to service_role;
grant all on hive.case_question_answers to service_role;
grant all on hive.study_run_question_answers to service_role;
grant all on hive.study_run_documents to service_role;
grant all on hive.intelligence_lineage to service_role;

drop policy if exists case_questions_select_own on hive.case_questions;
create policy case_questions_select_own on hive.case_questions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists case_questions_insert_own on hive.case_questions;
create policy case_questions_insert_own on hive.case_questions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists case_question_answers_select_own on hive.case_question_answers;
create policy case_question_answers_select_own on hive.case_question_answers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists case_question_answers_insert_own on hive.case_question_answers;
create policy case_question_answers_insert_own on hive.case_question_answers
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists study_run_question_answers_select_own on hive.study_run_question_answers;
create policy study_run_question_answers_select_own on hive.study_run_question_answers
  for select to authenticated
  using (
    exists (
      select 1 from hive.study_runs sr
      where sr.id = study_run_id and sr.user_id = auth.uid()
    )
  );

drop policy if exists study_run_question_answers_insert_own on hive.study_run_question_answers;
create policy study_run_question_answers_insert_own on hive.study_run_question_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from hive.study_runs sr
      where sr.id = study_run_id and sr.user_id = auth.uid()
    )
  );

drop policy if exists study_run_documents_select_own on hive.study_run_documents;
create policy study_run_documents_select_own on hive.study_run_documents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists study_run_documents_insert_own on hive.study_run_documents;
create policy study_run_documents_insert_own on hive.study_run_documents
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists intelligence_lineage_select_own on hive.intelligence_lineage;
create policy intelligence_lineage_select_own on hive.intelligence_lineage
  for select to authenticated using (user_id = auth.uid());

drop policy if exists intelligence_lineage_insert_own on hive.intelligence_lineage;
create policy intelligence_lineage_insert_own on hive.intelligence_lineage
  for insert to authenticated with check (user_id = auth.uid());
