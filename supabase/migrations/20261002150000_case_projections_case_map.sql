-- Allow immutable case-map/1 projections alongside customer and pro views.

alter table hive.case_projections drop constraint if exists case_projections_kind_check;

alter table hive.case_projections
  add constraint case_projections_kind_check
  check (projection_kind in ('customer', 'pro', 'case_map'));
