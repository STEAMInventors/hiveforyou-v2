-- Local document identity replaces external JEV for intake classification.

alter table hive.intake_runs
  drop constraint if exists intake_runs_classifier_check;

alter table hive.intake_runs
  add constraint intake_runs_classifier_check check (classifier in ('JEV', 'LOCAL'));

alter table hive.document_identities
  drop constraint if exists document_identities_proposal_check;

alter table hive.document_identities
  add constraint document_identities_proposal_check check (
    (
      processing_status in ('CLASSIFIED', 'NEEDS_REVIEW')
      and proposed_type is not null
      and confidence is not null
      and proposed_by in ('JEV', 'LOCAL')
    )
    or (
      processing_status not in ('CLASSIFIED', 'NEEDS_REVIEW')
      and proposed_type is null
      and confidence is null
    )
  );
