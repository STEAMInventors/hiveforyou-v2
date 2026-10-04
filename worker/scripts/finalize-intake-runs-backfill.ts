import { createClient } from "@supabase/supabase-js";

import { finalizeIntakeRunPack } from "@hiveforyou/intake";

import { buildWorkerIntakeDeps } from "../src/intake/build-intake-deps.js";
import { readWorkerEnv } from "../src/env.js";

async function main(): Promise<void> {
  const env = readWorkerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .schema("hive")
    .from("intake_runs")
    .select("id,user_id,status,pack_execution")
    .in("status", ["SUCCEEDED", "NEEDS_REVIEW"])
    .is("pack_execution", null);

  if (error) {
    throw error;
  }

  let fixed = 0;
  for (const row of rows ?? []) {
    const userId = String(row.user_id);
    const intakeRunId = String(row.id);
    const { deps } = buildWorkerIntakeDeps(supabase, env, userId);
    const run = await deps.runs.getById(userId, intakeRunId);
    if (!run || run.packExecutionJson) {
      continue;
    }
    const finalized = await finalizeIntakeRunPack(deps, run);
    await deps.runs.save(finalized);
    fixed += 1;
  }

  console.info("[finalize-intake-runs-backfill]", { fixed, scanned: rows?.length ?? 0 });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
