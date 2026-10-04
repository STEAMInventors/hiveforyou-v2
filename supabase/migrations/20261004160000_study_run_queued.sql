-- Phase 2b: worker-queued canonical study runs (HIVE_PIPELINE=inngest)

alter table hive.study_runs
  drop constraint if exists study_runs_status_check;

alter table hive.study_runs
  add constraint study_runs_status_check check (
    status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
  );
