-- Link canonical study runs to Intake Evidence Workspace runs.

alter table hive.study_runs
  add column if not exists intake_run_id uuid references hive.intake_runs (id);

create index if not exists study_runs_intake_run_idx
  on hive.study_runs (intake_run_id);
