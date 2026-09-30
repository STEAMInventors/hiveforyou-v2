-- Engine 1 adaptive discovery: mandatory customer objective gate.



alter table hive.discover_runs drop constraint if exists discover_runs_status_check;



alter table hive.discover_runs

  add constraint discover_runs_status_check check (

    status in (

      'RUNNING',

      'SUCCEEDED',

      'NEEDS_REVIEW',

      'NEEDS_OBJECTIVE_INPUT',

      'NEEDS_DISCOVERY_INPUT',

      'NEEDS_EVIDENCE_INPUT',

      'READY_FOR_STUDY',

      'FAILED'

    )

  );


