import "server-only";

import type { PersistedCaseIntelligence } from "@hiveforyou/canonical";
import { CASE_INTELLIGENCE_SCHEMA_V3 } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import type { HiveGateway } from "@/lib/persistence/hive-gateway";

export async function loadCanonicalCaseByStudyRunId(input: {
  gateway: HiveGateway;
  userId: string;
  studyRunId: string;
}): Promise<CanonicalCaseSnapshot | null> {
  const rows = await input.gateway.selectWhere(
    "case_intelligence_snapshots",
    {
      study_run_id: input.studyRunId,
      user_id: input.userId,
    },
    { orderBy: "version", ascending: false, limit: 1 },
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const snapshot = row.intelligence_json as PersistedCaseIntelligence;
  return snapshot.schemaVersion === CASE_INTELLIGENCE_SCHEMA_V3
    ? (snapshot as CanonicalCaseSnapshot)
    : null;
}
