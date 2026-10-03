-- Per-run participation: whether a source file is included in workspace analysis.
alter table hive.document_identities
  add column if not exists analysis_disposition text not null default 'PRESENT';

alter table hive.document_identities
  drop constraint if exists document_identities_analysis_disposition_check;

alter table hive.document_identities
  add constraint document_identities_analysis_disposition_check check (
    analysis_disposition in ('PRESENT', 'DISCARDED')
  );
