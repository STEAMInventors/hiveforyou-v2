import {
  executeHiveWriterShadowRequest as executeHiveWriterShadowJob,
  loadDeterministicCanonicalStudyArtifact,
  type HiveWriterHttpClient,
} from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";
import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";
import type { HiveWriterShadowRecord } from "@hiveforyou/shared/hive-writer-proposal";

import type { HiveGateway } from "../persistence/hive-gateway.js";
import { SupabaseStudyArtifactRepository } from "../persistence/supabase-study-artifacts.js";
import { SupabaseStudyContextRepository } from "../persistence/worker-supabase-repositories.js";

/** Loads the persisted canonical study for the verified owner, then runs the core Writer job. */
export async function executeHiveWriterShadowRequest(input: {
  claimedUserId: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  env: Record<string, string | undefined>;
  gateway: HiveGateway;
  loadArtifact?: (userId: string) => Promise<CanonicalStudyArtifact>;
  invokeWriter?: HiveWriterHttpClient;
}): Promise<HiveWriterShadowRecord> {
  const loadArtifact =
    input.loadArtifact ??
    ((userId: string) =>
      loadDeterministicCanonicalStudyArtifact({
        userId,
        studyRunId: input.studyRunId,
        storage: input.gateway,
        studyArtifactRepo: new SupabaseStudyArtifactRepository(input.gateway, userId),
        contextRepo: new SupabaseStudyContextRepository(input.gateway, userId),
      }));

  return executeHiveWriterShadowJob({
    claimedUserId: input.claimedUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    audience: input.audience,
    env: input.env,
    gateway: input.gateway,
    loadArtifact,
    invokeWriter: input.invokeWriter,
  });
}
