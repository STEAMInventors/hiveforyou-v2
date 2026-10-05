import {
  HIVE_EVENT_STUDY_REQUESTED,
  hiveStudyRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  isStudyArtifactProposePlaceholder,
  isStudyNonRetriableErrorCode,
  markStudyRunWorkerFailed,
  runStudyWorkerCompleteStep,
  runStudyWorkerLoadContext,
  runStudyWorkerProposeStep,
  runStudyWorkerProjectionsStep,
  runStudyWorkerStoryStep,
  runStudyWorkerValidateStep,
  StudyArtifactContentMismatchError,
  type StudyArtifactRecord,
} from "@hiveforyou/core";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import { NonRetriableError } from "inngest";

import { attachCaseCustomerContext, buildWorkerStudyDeps } from "../../study/build-worker-study-deps.js";
import { loadIntakeStudyRequest } from "../../study/load-intake-study-request.js";
import type { ModelCallMetrics } from "@hiveforyou/model-providers/env";
import { readWorkerEnv } from "../../env.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { inngest } from "../client.js";

const GLOBAL_STUDY_MODEL_CONCURRENCY = 3;

type StudyWorkerStepId =
  | "load-context"
  | "propose"
  | "validate"
  | "projections"
  | "story"
  | "complete";

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function mergeModelMetrics(
  payload: Record<string, unknown>,
  metrics: ModelCallMetrics | undefined,
): Record<string, unknown> {
  if (!metrics) {
    return payload;
  }
  return {
    ...payload,
    provider: metrics.provider,
    model: metrics.model,
    ...(metrics.inputTokens != null ? { inputTokens: metrics.inputTokens } : {}),
    ...(metrics.outputTokens != null ? { outputTokens: metrics.outputTokens } : {}),
  };
}

function extractStepErrorFields(error: unknown): { errorCode?: string; errorKind?: string } {
  if (error instanceof Error && error.name) {
    const code =
      "errorCode" in error && typeof (error as { errorCode?: unknown }).errorCode === "string"
        ? (error as { errorCode: string }).errorCode
        : undefined;
    return { errorCode: code ?? error.name, errorKind: error.name };
  }
  return { errorKind: "Error" };
}

function logStudyStepTiming(payload: Record<string, unknown>): void {
  console.info("[hive/timing]", JSON.stringify(payload));
}

export function parseStudyFailureEvent(event: { data?: unknown }) {
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
  if (error instanceof StudyArtifactContentMismatchError) {
    throw new NonRetriableError(error.errorCode);
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

function hasCompletedStudyValidation(artifact: StudyArtifactRecord | null | undefined): boolean {
  if (!artifact?.validationResultJson || !("status" in artifact.validationResultJson)) {
    return false;
  }
  return !isStudyArtifactProposePlaceholder(
    artifact.validationResultJson as CanonicalStudyValidationResultV3,
  );
}

function readAttempt(ctx: { attempt?: number } | undefined): number {
  const raw = ctx?.attempt;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

async function runHiveStudyHandler({
  event,
  step,
  attempt = 0,
}: {
  event: { data: unknown };
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  };
  attempt?: number;
}) {
  const data = hiveStudyRequestedEventDataSchema.parse(event.data);
  const env = readWorkerEnv();
  const supabase = createWorkerAdminSupabase(env);
  const built = buildWorkerStudyDeps(supabase, env, data.userId);
  let deps = await attachCaseCustomerContext(built.deps, built.customerContextRepo, data.caseId);
  const { modelMetrics } = built;

  const timingBase = {
    stage: "study" as const,
    studyRunId: data.studyRunId,
    intakeRunId: data.intakeRunId,
    attempt,
  };

  async function runTimedStep<T>(
    stepId: StudyWorkerStepId,
    outcomeFromResult: (result: T) => "ok" | "skipped",
    fn: () => Promise<T>,
  ): Promise<T> {
    modelMetrics.reset();
    const start = performance.now();
    try {
      const result = await fn();
      const outcome = outcomeFromResult(result);
      logStudyStepTiming(
        mergeModelMetrics(
          {
            ...timingBase,
            step: stepId,
            ms: elapsedMs(start),
            outcome,
          },
          modelMetrics.take(),
        ),
      );
      return result;
    } catch (error) {
      const fields = extractStepErrorFields(error);
      logStudyStepTiming(
        mergeModelMetrics(
          {
            ...timingBase,
            step: stepId,
            ms: elapsedMs(start),
            outcome: "error",
            ...fields,
          },
          modelMetrics.take(),
        ),
      );
      throw error;
    }
  }

  function logSkippedStep(stepId: StudyWorkerStepId): void {
    logStudyStepTiming({
      ...timingBase,
      step: stepId,
      ms: 0,
      outcome: "skipped",
    });
  }

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

  const loaded = await step.run("load-context", async () =>
    runTimedStep("load-context", (result) => (result.skipped ? "skipped" : "ok"), async () => {
      try {
        return await runStudyWorkerLoadContext(deps, data, request, resolvedPack);
      } catch (error) {
        rethrowStepError(error);
      }
    }),
  );

  if (loaded.skipped) {
    return { skipped: loaded.skipped };
  }

  const artifactBeforePropose = await deps.studyArtifactRepo?.getByStudyRunId(data.studyRunId);
  const validationComplete = hasCompletedStudyValidation(artifactBeforePropose);

  if (!validationComplete) {
    await step.run("propose", async () =>
      runTimedStep(
        "propose",
        (result) => (result.proposalSkipped ? "skipped" : "ok"),
        async () => {
          try {
            return await runStudyWorkerProposeStep(deps, data, request);
          } catch (error) {
            rethrowStepError(error);
          }
        },
      ),
    );

    await step.run("validate", async () =>
      runTimedStep("validate", () => "ok", async () => {
        try {
          return await runStudyWorkerValidateStep(deps, data);
        } catch (error) {
          rethrowStepError(error);
        }
      }),
    );
  } else {
    logSkippedStep("propose");
    logSkippedStep("validate");
  }

  await step.run("projections", async () =>
    runTimedStep("projections", () => "ok", async () => {
      try {
        return await runStudyWorkerProjectionsStep(deps, data);
      } catch (error) {
        rethrowStepError(error);
      }
    }),
  );

  await step.run("story", async () =>
    runTimedStep("story", () => "ok", async () => {
      try {
        return await runStudyWorkerStoryStep(deps, data);
      } catch (error) {
        rethrowStepError(error);
      }
    }),
  );

  const completed = await step.run("complete", async () =>
    runTimedStep("complete", () => "ok", async () => {
      try {
        return await runStudyWorkerCompleteStep(deps, data);
      } catch (error) {
        rethrowStepError(error);
      }
    }),
  );

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
  (ctx) =>
    runHiveStudyHandler({
      event: ctx.event,
      step: ctx.step,
      attempt: readAttempt(ctx as { attempt?: number }),
    }),
);
