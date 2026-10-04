import {
  HIVE_EVENT_STUDY_REQUESTED,
  hiveStudyRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  isStudyNonRetriableErrorCode,
  markStudyRunWorkerFailed,
  runStudyWorkerCompleteStep,
  runStudyWorkerLoadContext,
  runStudyWorkerProposeStep,
  runStudyWorkerProjectionsStep,
  runStudyWorkerStoryStep,
  runStudyWorkerValidateStep,
} from "@hiveforyou/core";
import { NonRetriableError } from "inngest";

import { attachCaseCustomerContext, buildWorkerStudyDeps } from "../../study/build-worker-study-deps.js";
import { loadIntakeStudyRequest } from "../../study/load-intake-study-request.js";
import { readWorkerEnv } from "../../env.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { inngest } from "../client.js";

const GLOBAL_STUDY_MODEL_CONCURRENCY = 3;

function parseStudyFailureEvent(event: { data?: unknown }) {
  const payload = event.data as { event?: { name?: string; data?: unknown } } | undefined;
  if (payload?.event?.name !== HIVE_EVENT_STUDY_REQUESTED) {
    return null;
  }
  return hiveStudyRequestedEventDataSchema.parse(payload.event.data);
}

function rethrowStepError(error: unknown): never {
  if (error instanceof NonRetriableError) {
    throw error;
  }
  const code =
    error && typeof error === "object" && "errorCode" in error
      ? String((error as { errorCode: unknown }).errorCode)
      : null;
  if (isStudyNonRetriableErrorCode(code)) {
    throw new NonRetriableError(code ?? "STUDY_NON_RETRIABLE");
  }
  throw error;
}

async function runHiveStudyHandler({
  event,
  step,
}: {
  event: { data: unknown };
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  };
}) {
  const data = hiveStudyRequestedEventDataSchema.parse(event.data);
  const env = readWorkerEnv();
  const supabase = createWorkerAdminSupabase(env);
  const built = buildWorkerStudyDeps(supabase, env, data.userId);
  let deps = await attachCaseCustomerContext(built.deps, built.customerContextRepo, data.caseId);

  const intakeRun = await built.intake.getById(data.userId, data.intakeRunId);
  if (!intakeRun) {
    return { skipped: "intake-missing" as const };
  }

  const request = await loadIntakeStudyRequest({
    intake: built.intake,
    documents: built.documents,
    userId: data.userId,
    run: intakeRun,
  });

  const resolvedPack = resolveDomainPackFromDiscoveryLabel(request.engine1Result.domainLabel);
  if (!resolvedPack) {
    throw new NonRetriableError("MISSING_DOMAIN_PACK");
  }

  const loaded = await step.run("load-context", async () => {
    try {
      return await runStudyWorkerLoadContext(deps, data, request, resolvedPack);
    } catch (error) {
      rethrowStepError(error);
    }
  });

  if (loaded.skipped) {
    return { skipped: loaded.skipped };
  }

  const artifactBeforePropose = await deps.studyArtifactRepo?.getByStudyRunId(data.studyRunId);
  const hasValidatedArtifact =
    artifactBeforePropose?.validationResultJson &&
    "status" in artifactBeforePropose.validationResultJson &&
    artifactBeforePropose.validationResultJson.status !== "FAILED";

  if (!hasValidatedArtifact) {
    await step.run("propose", async () => {
      try {
        return await runStudyWorkerProposeStep(deps, data, request);
      } catch (error) {
        rethrowStepError(error);
      }
    });

    await step.run("validate", async () => {
      try {
        return await runStudyWorkerValidateStep(deps, data);
      } catch (error) {
        rethrowStepError(error);
      }
    });
  }

  await step.run("projections", async () => {
    try {
      return await runStudyWorkerProjectionsStep(deps, data);
    } catch (error) {
      rethrowStepError(error);
    }
  });

  await step.run("story", async () => {
    try {
      return await runStudyWorkerStoryStep(deps, data);
    } catch (error) {
      rethrowStepError(error);
    }
  });

  const completed = await step.run("complete", async () => {
    try {
      return await runStudyWorkerCompleteStep(deps, data);
    } catch (error) {
      rethrowStepError(error);
    }
  });

  return { completed };
}

export const hiveStudy = inngest.createFunction(
  {
    id: "hive-study",
    concurrency: [
      { key: "event.data.userId", limit: 1 },
      { key: "\"global-study-model\"", limit: GLOBAL_STUDY_MODEL_CONCURRENCY },
    ],
    triggers: [{ event: HIVE_EVENT_STUDY_REQUESTED }],
    onFailure: async ({ event, step }) => {
      const studyEvent = parseStudyFailureEvent(event);
      if (!studyEvent) {
        return { skipped: "not-study-event" as const };
      }
      await step.run("mark-run-failed", async () => {
        const env = readWorkerEnv();
        const supabase = createWorkerAdminSupabase(env);
        const { deps } = buildWorkerStudyDeps(supabase, env, studyEvent.userId);
        await markStudyRunWorkerFailed(deps.runRepo, deps.eventRepo, {
          userId: studyEvent.userId,
          studyRunId: studyEvent.studyRunId,
          errorCode: "STUDY_WORKER_FAILED",
        });
      });
      return { marked: true as const };
    },
  },
  runHiveStudyHandler,
);
