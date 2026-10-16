import {
  CanonicalStudyArtifactsNotFoundError,
  HiveWriterDomainBindingError,
  WriterShadowOwnerError,
} from "@hiveforyou/core";
import {
  HIVE_EVENT_WRITER_SHADOW_REQUESTED,
  hiveWriterShadowRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { NonRetriableError } from "inngest";

import { readWorkerEnv } from "../../env.js";
import { createSupabaseHiveGateway } from "../../persistence/hive-gateway.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { executeHiveWriterShadowRequest } from "../../study/execute-hive-writer-shadow.js";
import { inngest } from "../client.js";

function workerEnvStrings(env: ReturnType<typeof readWorkerEnv>): Record<string, string | undefined> {
  return {
    HIVE_AGENTS_HOST: env.HIVE_AGENTS_HOST,
    HIVE_AGENTS_PORT: env.HIVE_AGENTS_PORT,
    HIVE_AGENTS_SERVICE_TOKEN: env.HIVE_AGENTS_SERVICE_TOKEN,
  };
}

export const hiveWriterShadow = inngest.createFunction(
  {
    id: "hive-writer-shadow",
    retries: 1,
    concurrency: [{ key: "event.data.studyRunId + ':' + event.data.audience", limit: 1 }],
    triggers: [{ event: HIVE_EVENT_WRITER_SHADOW_REQUESTED }],
  },
  async ({ event }) => {
    const data = hiveWriterShadowRequestedEventDataSchema.parse(event.data);
    const env = readWorkerEnv();
    const supabase = createWorkerAdminSupabase(env);
    const gateway = createSupabaseHiveGateway(supabase);

    try {
      const record = await executeHiveWriterShadowRequest({
        claimedUserId: data.userId,
        caseId: data.caseId,
        studyRunId: data.studyRunId,
        audience: data.audience,
        env: workerEnvStrings(env),
        gateway,
      });
      return {
        studyRunId: record.studyRunId,
        audience: record.audience,
        status: record.status,
        idempotencyKey: record.idempotencyKey,
      };
    } catch (error) {
      if (
        error instanceof WriterShadowOwnerError ||
        error instanceof CanonicalStudyArtifactsNotFoundError ||
        error instanceof HiveWriterDomainBindingError
      ) {
        throw new NonRetriableError(error instanceof WriterShadowOwnerError ? error.code : error.message);
      }
      if (error instanceof Error && error.message === "WRITER_HOST_NOT_LOOPBACK") {
        throw new NonRetriableError("WRITER_HOST_NOT_LOOPBACK");
      }
      if (error instanceof Error && error.message.includes("HIVE_AGENTS_SERVICE_TOKEN is required")) {
        throw new NonRetriableError("WRITER_AUTH_UNAVAILABLE");
      }
      throw error;
    }
  },
);
