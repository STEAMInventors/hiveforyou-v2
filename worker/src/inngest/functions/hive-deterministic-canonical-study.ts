import {
  HIVE_EVENT_DETERMINISTIC_CANONICAL_STUDY_BUILD,
  hiveDeterministicCanonicalStudyBuildEventDataSchema,
} from "@hiveforyou/shared/events";
import { NonRetriableError } from "inngest";

import { readWorkerEnv } from "../../env.js";
import { createSupabaseHiveGateway } from "../../persistence/hive-gateway.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { runDeterministicCanonicalStudyOnWorker } from "../../study/run-deterministic-canonical-study-worker.js";
import {
  DeterministicCanonicalStudyConflictError,
  PackNotAvailableError,
  RawExtractionNotFoundError,
  SourcePagesUnavailableError,
} from "@hiveforyou/core";
import { inngest } from "../client.js";

function workerEnvStrings(env: Record<string, unknown>): Record<string, string | undefined> {
  return env as Record<string, string | undefined>;
}

export const hiveDeterministicCanonicalStudyBuild = inngest.createFunction(
  {
    id: "hive-deterministic-canonical-study-build",
    concurrency: [{ key: "event.data.studyRunId", limit: 1 }],
    triggers: [{ event: HIVE_EVENT_DETERMINISTIC_CANONICAL_STUDY_BUILD }],
  },
  async ({ event }) => {
    const data = hiveDeterministicCanonicalStudyBuildEventDataSchema.parse(event.data);
    const env = readWorkerEnv();
    const supabase = createWorkerAdminSupabase(env);
    const gateway = createSupabaseHiveGateway(supabase);

    try {
      const result = await runDeterministicCanonicalStudyOnWorker({
        gateway,
        userId: data.userId,
        caseId: data.caseId,
        studyRunId: data.studyRunId,
        env: workerEnvStrings(env),
      });
      return {
        studyRunId: result.studyRunId,
        attemptId: result.attemptId,
        artifactContentSha256: result.artifact.contentSha256,
        artifactObjectKey: result.artifactObjectKey,
        status: result.runManifest.status,
      };
    } catch (error) {
      if (error instanceof RawExtractionNotFoundError) {
        throw new NonRetriableError(error.code);
      }
      if (error instanceof PackNotAvailableError) {
        throw new NonRetriableError("PACK_NOT_AVAILABLE");
      }
      if (error instanceof SourcePagesUnavailableError) {
        throw new NonRetriableError(error.code);
      }
      if (error instanceof DeterministicCanonicalStudyConflictError) {
        throw new NonRetriableError(error.code);
      }
      throw error;
    }
  },
);
