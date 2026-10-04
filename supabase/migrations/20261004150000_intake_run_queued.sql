-- Allow worker-queued intake runs before processing starts.

alter table hive.intake_runs
  drop constraint if exists intake_runs_status_check;

alter table hive.intake_runs
  add constraint intake_runs_status_check check (
    status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
  );

alter table hive.intake_runs
  add column if not exists intake_queue_seq integer not null default 0;
