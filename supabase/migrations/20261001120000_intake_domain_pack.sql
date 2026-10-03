-- Intake domain resolution + pack execution (provenance separate from Jev document identity).

alter table hive.intake_runs
  add column if not exists raw_intent text,
  add column if not exists explicit_domain_id text,
  add column if not exists jev_domain_proposal text,
  add column if not exists jev_domain_confidence numeric,
  add column if not exists resolved_domain_id text,
  add column if not exists resolution_source text,
  add column if not exists study_path text,
  add column if not exists pack_execution jsonb;

alter table hive.intake_runs
  drop constraint if exists intake_runs_study_path_check;

alter table hive.intake_runs
  add constraint intake_runs_study_path_check check (
    study_path is null or study_path in ('DOMAIN_PACK', 'GENERIC_STUDY')
  );

alter table hive.intake_runs
  drop constraint if exists intake_runs_resolution_source_check;

alter table hive.intake_runs
  add constraint intake_runs_resolution_source_check check (
    resolution_source is null
    or resolution_source in ('EXPLICIT', 'JEV', 'UNRESOLVED')
  );
