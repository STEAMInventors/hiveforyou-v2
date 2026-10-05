-- Allow one-time validation_result_json completion on study_artifacts (proposal locked).

create or replace function hive.study_artifacts_guard_mutation()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'row is immutable';
  end if;
  if TG_OP = 'UPDATE' then
    if OLD.study_run_id is not distinct from NEW.study_run_id
       and OLD.case_id is not distinct from NEW.case_id
       and OLD.user_id is not distinct from NEW.user_id
       and OLD.raw_proposal_json is not distinct from NEW.raw_proposal_json
       and OLD.validation_result_json is distinct from NEW.validation_result_json then
      return NEW;
    end if;
    raise exception 'row is immutable';
  end if;
  return NEW;
end;
$$;

drop trigger if exists study_artifacts_reject_mutation on hive.study_artifacts;
drop trigger if exists study_artifacts_guard_mutation on hive.study_artifacts;
create trigger study_artifacts_guard_mutation
  before update or delete on hive.study_artifacts
  for each row execute function hive.study_artifacts_guard_mutation();
