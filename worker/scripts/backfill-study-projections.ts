import { createClient } from "@supabase/supabase-js";

import {
  buildStudyRequestedEventId,
  HIVE_EVENT_STUDY_REQUESTED,
  hiveStudyRequestedEventDataSchema,
} from "@hiveforyou/shared/events";

import { readWorkerEnv } from "../src/env.js";
import { createSupabaseHiveGateway } from "../src/persistence/hive-gateway.js";
import { inngest } from "../src/inngest/client.js";

/** One-time: re-queue succeeded intake studies missing persisted projections. */
async function main() {
  const env = readWorkerEnv();
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const gateway = createSupabaseHiveGateway(client);
  const runs = await gateway.selectWhere("study_runs", {}, { limit: 500 });
  let queued = 0;
  for (const row of runs) {
    const status = String(row.status);
    if (status !== "SUCCEEDED" && status !== "NEEDS_REVIEW") {
      continue;
    }
    const intakeRunId = row.intake_run_id ? String(row.intake_run_id) : "";
    if (!intakeRunId) {
      continue;
    }
    const version = row.case_intelligence_version == null ? null : Number(row.case_intelligence_version);
    if (version == null) {
      continue;
    }
    const projections = await gateway.selectWhere("case_projections", {
      case_id: String(row.case_id),
      user_id: String(row.user_id),
      intelligence_version: version,
    });
    const kinds = new Set(projections.map((p) => String(p.projection_kind)));
    if (kinds.has("case_map") && kinds.has("pro") && kinds.has("case_view")) {
      continue;
    }
    const studyRunId = String(row.id);
    const data = hiveStudyRequestedEventDataSchema.parse({
      userId: String(row.user_id),
      caseId: String(row.case_id),
      intakeRunId,
      studyRunId,
    });
    await inngest.send({
      id: buildStudyRequestedEventId(studyRunId),
      name: HIVE_EVENT_STUDY_REQUESTED,
      data,
    });
    queued += 1;
  }
  console.info("[backfill-study-projections] queued", { queued });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
