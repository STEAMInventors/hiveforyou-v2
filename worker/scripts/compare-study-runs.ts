import { createClient } from "@supabase/supabase-js";

import { readWorkerEnv } from "../src/env.js";
import { createSupabaseHiveGateway } from "../src/persistence/hive-gateway.js";
import { SupabaseStudyRunRepository } from "../src/persistence/worker-supabase-repositories.js";

type StudyMetrics = {
  studyRunId: string;
  status: string;
  acceptedClaims: number;
  conflicts: number;
  missingInformation: number;
  hasCaseView: boolean;
  hasProView: boolean;
  hasCaseMap: boolean;
  storyPresent: boolean;
};

async function loadMetrics(
  gateway: ReturnType<typeof createSupabaseHiveGateway>,
  userId: string,
  studyRunId: string,
): Promise<StudyMetrics | null> {
  const runs = new SupabaseStudyRunRepository(gateway, userId);
  const run = await runs.getByStudyRunId(studyRunId);
  if (!run) {
    return null;
  }
  const artifactRows = await gateway.selectWhere(
    "study_artifacts",
    { study_run_id: studyRunId, user_id: userId },
    { orderBy: "created_at", ascending: false, limit: 1 },
  );
  const validation = artifactRows[0]?.validation_result_json as
    | {
        accepted?: {
          claims?: unknown[];
          conflicts?: unknown[];
          missingInformation?: unknown[];
        };
      }
    | undefined;

  const version = run.caseIntelligenceVersion;
  let hasCaseView = false;
  let hasProView = false;
  let hasCaseMap = false;
  let storyPresent = false;
  if (version != null) {
    const projections = await gateway.selectWhere("case_projections", {
      case_id: run.caseId,
      user_id: userId,
      intelligence_version: version,
    });
    for (const row of projections) {
      const kind = String(row.projection_kind);
      if (kind === "case_view") {
        hasCaseView = true;
        const json = row.projection_json as { validatedStory?: { kind?: string } };
        storyPresent = json?.validatedStory?.kind === "prose";
      }
      if (kind === "pro") {
        hasProView = true;
      }
      if (kind === "case_map") {
        hasCaseMap = true;
      }
    }
  }

  return {
    studyRunId,
    status: run.status,
    acceptedClaims: validation?.accepted?.claims?.length ?? 0,
    conflicts: validation?.accepted?.conflicts?.length ?? 0,
    missingInformation: validation?.accepted?.missingInformation?.length ?? 0,
    hasCaseView,
    hasProView,
    hasCaseMap,
    storyPresent,
  };
}

async function main() {
  const env = readWorkerEnv();
  const leftId = process.argv[2]?.trim();
  const rightId = process.argv[3]?.trim();
  const userId = process.argv[4]?.trim();
  if (!leftId || !rightId || !userId) {
    console.error(
      "Usage: compare-study-runs <inlineStudyRunId> <inngestStudyRunId> <userId>",
    );
    process.exit(1);
  }
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const gateway = createSupabaseHiveGateway(client);
  const left = await loadMetrics(gateway, userId, leftId);
  const right = await loadMetrics(gateway, userId, rightId);
  console.log(JSON.stringify({ left, right }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
