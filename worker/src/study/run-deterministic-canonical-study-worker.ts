import { runDeterministicCanonicalStudy } from "@hiveforyou/core";

import type { HiveGateway } from "../persistence/hive-gateway.js";
import { SupabaseSourceDocumentRepository } from "../persistence/worker-supabase-repositories.js";
import { SupabaseStudyArtifactRepository } from "../persistence/supabase-study-artifacts.js";
import { SupabaseStudyContextRepository } from "../persistence/worker-supabase-repositories.js";

export async function runDeterministicCanonicalStudyOnWorker(input: {
  gateway: HiveGateway;
  userId: string;
  caseId: string;
  studyRunId: string;
  env?: Record<string, string | undefined>;
}) {
  return runDeterministicCanonicalStudy({
    userId: input.userId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    storage: input.gateway,
    studyArtifactRepo: new SupabaseStudyArtifactRepository(input.gateway, input.userId),
    contextRepo: new SupabaseStudyContextRepository(input.gateway, input.userId),
    sourceDocuments: new SupabaseSourceDocumentRepository(input.gateway, input.userId),
    env: input.env,
  });
}
