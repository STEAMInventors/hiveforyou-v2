import "server-only";

import type { PersistedCaseIntelligence } from "@hiveforyou/canonical";
import { CASE_INTELLIGENCE_SCHEMA_V3 } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import type { HiveGateway } from "@/lib/persistence/hive-gateway";

/** Latest persisted canonical case (`case-intelligence/3` only). Ignores legacy /2 rows. */
export async function loadLatestCanonicalCaseIntelligence(input: {
  gateway: HiveGateway;
  userId: string;
  caseId: string;
  intelligenceVersion?: number;
}): Promise<CanonicalCaseSnapshot | null> {
  if (input.intelligenceVersion != null) {
    const rows = await input.gateway.selectWhere(
      "case_intelligence_snapshots",
      {
        case_id: input.caseId,
        user_id: input.userId,
        version: input.intelligenceVersion,
      },
      { limit: 1 },
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

  const rows = await input.gateway.selectWhere(
    "case_intelligence_snapshots",
    { case_id: input.caseId, user_id: input.userId },
    { orderBy: "version", ascending: false },
  );
  for (const row of rows) {
    const snapshot = row.intelligence_json as PersistedCaseIntelligence;
    if (snapshot.schemaVersion === CASE_INTELLIGENCE_SCHEMA_V3) {
      return snapshot as CanonicalCaseSnapshot;
    }
  }
  return null;
}
