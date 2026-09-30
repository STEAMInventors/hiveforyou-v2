-- Align intelligence lineage with ADR-006 logical-document provenance:
-- logical document ids are opaque strings (e.g. ld-referral, doc-*), not UUIDs.

alter table hive.intelligence_lineage
  add column if not exists logical_document_id text;

comment on column hive.intelligence_lineage.logical_document_id is
  'Structure Map logical document id for DOCUMENT_EVIDENCE lineage; opaque string, not a UUID.';

create index if not exists intelligence_lineage_logical_document_idx
  on hive.intelligence_lineage (logical_document_id)
  where logical_document_id is not null;
