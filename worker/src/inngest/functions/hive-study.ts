import {
  HIVE_EVENT_STUDY_REQUESTED,
  hiveStudyRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  applyDiscoverToStudyRequest,
  isStudyArtifactProposePlaceholder,
  isStudyNonRetriableErrorCode,
  markStudyRunWorkerFailed,
  resolveStudyProcessingMode,
  hasCompletedPackDrivenRawExtraction,
  runStudyWorkerCompleteRawExtractionStep,
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
import { DocumentPagesStorage } from "../../intake/document-pages-storage.js";
import { readWorkerEnv } from "../../env.js";
import { SupabaseShadowStudyArtifactRepository } from "../../persistence/supabase-shadow-study-artifacts.js";
import { createSupabaseHiveGateway } from "../../persistence/hive-gateway.js";
import { WorkerIntakeRepository } from "../../persistence/worker-intake-repository.js";
import { WorkerSourceDocumentRepository } from "../../intake/worker-source-documents.js";
import {
  isStudyShadowEnabled,
  runStudyShadowPipeline,
} from "../../study/run-study-shadow-steps.js";
import { ShadowWorkStorage } from "../../study/shadow-work-storage.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { inngest } from "../client.js";
import {
  ensureDiscoverForPackDrivenStudy,
  type EnsureDiscoverForStudyResult,
} from "../../study/ensure-discover-for-pack-driven-study.js";
import type { WorkerEnv } from "../../env.js";
import type { ShadowStudyStepRunner } from "../../study/run-study-shadow-steps.js";
import { createReaderHttpClient } from "../../study/create-reader-http-client.js";
import {
  PackDrivenReaderProductionError,
  runProductionPackDrivenReader,
} from "../../study/run-production-pack-driven-reader.js";

const GLOBAL_STUDY_MODEL_CONCURRENCY = 3;

function workerEnvStrings(env: WorkerEnv): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

type StudyWorkerStepId =
  | "discover-ensure"
  | "load-context"
  | "reader"
  | "complete-raw-extraction"
  | "propose"
  | "validate"
  | "projections"
  | "story"
  | "complete";

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

export function mergeModelMetrics(
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
    ...(metrics.cacheReadInputTokens != null
      ? { cacheReadInputTokens: metrics.cacheReadInputTokens }
      : {}),
    ...(metrics.cacheWriteInputTokens != null
      ? { cacheWriteInputTokens: metrics.cacheWriteInputTokens }
      : {}),
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

type HiveStudyInngestStep = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

async function runHiveStudyHandler({
  event,
  step,
  attempt = 0,
}: {
  event: { data: unknown };
  step: HiveStudyInngestStep;
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

  let request = await loadIntakeStudyRequest({
    intake: built.intake,
    documents: built.documents,
    userId: data.userId,
    run: intakeRun,
  });
  const storedContextMode = (await deps.contextRepo.getByStudyRunId(data.studyRunId))?.processingPolicy
    .processingMode;
  request = {
    ...request,
    processingMode:
      data.processingMode ?? request.processingMode ?? storedContextMode ?? "canonical_openai_v4",
  };

  const processingMode = resolveStudyProcessingMode(request);
  const gateway = createSupabaseHiveGateway(supabase);

  if (processingMode === "pack_driven_v1") {
    const discoverOutcome = (await step.run("discover-ensure", async () =>
      runTimedStep("discover-ensure", (result) => (result.ok ? "ok" : "skipped"), async () => {
        return ensureDiscoverForPackDrivenStudy({
          gateway,
          intake: built.intake,
          documents: built.documents,
          userId: data.userId,
          caseId: data.caseId,
          intakeRunId: data.intakeRunId,
          domainId: intakeRun.resolvedDomainId ?? "iep",
          domainLabel: intakeRun.rawIntent ?? undefined,
          request,
        });
      }),
    )) as EnsureDiscoverForStudyResult;
    if (!discoverOutcome.ok) {
      if (discoverOutcome.code === "DISCOVER_AWAITING_INPUT") {
        throw new NonRetriableError("DISCOVER_AWAITING_INPUT");
      }
      throw new NonRetriableError(discoverOutcome.code);
    }
    if (discoverOutcome.engine1Source === "discover_artifact") {
      request = applyDiscoverToStudyRequest(request, {
        discoverRunId: discoverOutcome.discoverRunId,
        documentDiscovery: discoverOutcome.documentDiscovery,
      });
    }
  }

  const resolvedPack = resolveDomainPackFromDiscoveryLabel(request.engine1Result.domainLabel);
  if (!resolvedPack) {
    throw new NonRetriableError("MISSING_DOMAIN_PACK");
  }

  const loaded = (await step.run("load-context", async () =>
    runTimedStep("load-context", (result) => (result.skipped ? "skipped" : "ok"), async () => {
      try {
        return await runStudyWorkerLoadContext(deps, data, request, resolvedPack);
      } catch (error) {
        rethrowStepError(error);
      }
    }),
  )) as Awaited<ReturnType<typeof runStudyWorkerLoadContext>>;

  if (loaded.skipped) {
    return { skipped: loaded.skipped };
  }

  const artifactBeforePropose = await deps.studyArtifactRepo?.getByStudyRunId(data.studyRunId);
  const validationComplete = hasCompletedStudyValidation(artifactBeforePropose);
  const rawExtractionComplete = hasCompletedPackDrivenRawExtraction(
    artifactBeforePropose?.rawProposalJson,
  );

  if (processingMode === "pack_driven_v1" && !rawExtractionComplete) {
    const readerResult = (await step.run("reader", async () =>
      runTimedStep("reader", () => "ok", async () => {
        const context = await deps.contextRepo.getByStudyRunId(data.studyRunId);
        if (!context) {
          throw new Error("STUDY_CONTEXT_NOT_FOUND");
        }
        const sources = await built.documents.listByCase(data.userId, data.caseId);
        const identities = await built.intake.listByRun(data.userId, data.intakeRunId);
        const presentIds = new Set(
          identities
            .filter((row) => row.analysisDisposition === "PRESENT")
            .map((row) => row.sourceDocumentId),
        );
        const registeredDocuments = sources
          .filter((row) => presentIds.has(row.id))
          .map((row) => ({
            id: row.id,
            sha256: row.sha256,
            filename: row.originalFilename,
          }));
        const documentPagesBucket = env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";
        try {
          return await runProductionPackDrivenReader({
            gateway,
            documentPagesBucket,
            context,
            userId: data.userId,
            registeredDocuments,
            env: workerEnvStrings(env),
            readerClient: createReaderHttpClient(workerEnvStrings(env)),
          });
        } catch (error) {
          if (error instanceof PackDrivenReaderProductionError) {
            throw new NonRetriableError(error.errorCode);
          }
          throw error;
        }
      }),
    )) as Awaited<ReturnType<typeof runProductionPackDrivenReader>>;

    const completed = await step.run("complete-raw-extraction", async () =>
      runTimedStep("complete-raw-extraction", () => "ok", async () => {
        return runStudyWorkerCompleteRawExtractionStep(deps, data, {
          attemptId: readerResult.attemptId,
          rawExtractionOutcome: readerResult.rawExtractionOutcome,
          succeededDocumentIds: readerResult.succeededDocumentIds,
          failedDocumentIds: readerResult.failedDocumentIds,
          documentExtractionAttemptManifestPath: readerResult.documentExtractionAttemptManifestPath,
          documentExtractionStudyRunManifestPath: readerResult.documentExtractionStudyRunManifestPath,
          audit: readerResult.audit,
          acceptedVerifierFactCount: readerResult.acceptedVerifierFactCount,
          promptSha256: readerResult.promptSha256,
          observedReaderIdentity: readerResult.observedReaderIdentity,
          readerPreflight: readerResult.readerPreflight,
        });
      }),
    );

    return { completed };
  }

  if (processingMode === "pack_driven_v1" && rawExtractionComplete) {
    logSkippedStep("reader");
    logSkippedStep("complete-raw-extraction");
    const terminalRun = await deps.runRepo.getByStudyRunId(data.studyRunId);
    return { completed: { status: terminalRun?.status ?? "SUCCEEDED" } };
  }

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

  if (isStudyShadowEnabled(env)) {
    const gateway = createSupabaseHiveGateway(supabase);
    const documentPagesBucket = env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || "document-pages";
    const studyArtifact = await deps.studyArtifactRepo?.getByStudyRunId(data.studyRunId);
    try {
      await runStudyShadowPipeline({
        ctx: {
          userId: data.userId,
          caseId: data.caseId,
          studyRunId: data.studyRunId,
          intakeRunId: data.intakeRunId,
        },
        deps: {
          env,
          artifacts: new SupabaseShadowStudyArtifactRepository(gateway),
          studyArtifact: studyArtifact ?? null,
          intake: new WorkerIntakeRepository(gateway, data.userId),
          documents: new WorkerSourceDocumentRepository(gateway, data.userId),
          documentPages: new DocumentPagesStorage(gateway, documentPagesBucket),
          shadowWork: new ShadowWorkStorage(gateway, documentPagesBucket),
        },
        step: step as unknown as ShadowStudyStepRunner,
      });
    } catch (error) {
      console.info(
        "[hive/shadow]",
        JSON.stringify({
          studyRunId: data.studyRunId,
          status: "failed",
          failedStep: "shadow-unhandled",
          errorKind: error instanceof Error ? error.name : "Error",
        }),
      );
    }
  }

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
