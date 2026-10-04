import {
  HIVE_EVENT_INTAKE_REQUESTED,
  hiveIntakeRequestedEventDataSchema,
} from "@hiveforyou/shared/events";
import {
  completeIntakeRunStatus,
  finalizeIntakeRunPackStep,
  isIntakeNonRetriableErrorCode,
  isTerminalIntakeRunStatus,
  loadIntakeRunForProcessing,
  markIntakeRunWorkerFailed,
  runIntakeExtractStep,
  runIntakeIdentityClassificationForRun,
} from "@hiveforyou/intake";
import { NonRetriableError } from "inngest";

import { readWorkerEnv } from "../../env.js";
import { buildWorkerIntakeDeps } from "../../intake/build-intake-deps.js";
import { createWorkerAdminSupabase } from "../../supabase/admin.js";
import { inngest } from "../client.js";

const GLOBAL_INTAKE_CONCURRENCY = 5;

/** Dev-only: first extract step throws once per source document id (per worker process). */
const faultInjectedExtractDocs = new Set<string>();

function rethrowStepError(error: unknown): never {
  if (error instanceof NonRetriableError) {
    throw error;
  }
  const code =
    error && typeof error === "object" && "errorCode" in error
      ? String((error as { errorCode: unknown }).errorCode)
      : null;
  if (isIntakeNonRetriableErrorCode(code)) {
    throw new NonRetriableError(code ?? "INTAKE_NON_RETRIABLE");
  }
  throw error;
}

function parseIntakeFailureEvent(event: { data?: unknown }) {
  const payload = event.data as { event?: { name?: string; data?: unknown } } | undefined;
  if (payload?.event?.name !== HIVE_EVENT_INTAKE_REQUESTED) {
    return null;
  }
  return hiveIntakeRequestedEventDataSchema.parse(payload.event.data);
}

type LoadedRun =
  | { bail: "missing" | "complete" }
  | {
      bail: null;
      runId: string;
      caseId: string;
      pendingExtractIds: string[];
    };

async function runHiveIntakeHandler({
  event,
  step,
}: {
  event: { data: unknown };
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
  };
}) {
  const data = hiveIntakeRequestedEventDataSchema.parse(event.data);
  const env = readWorkerEnv();
  const supabase = createWorkerAdminSupabase(env);
  const { deps, documents } = buildWorkerIntakeDeps(supabase, env, data.userId);

  const loaded = (await step.run("load-run", async () => {
    const result = await loadIntakeRunForProcessing(deps, data.userId, data.intakeRunId);
    if (result.kind === "bail") {
      return { bail: result.reason } as const;
    }
    return {
      bail: null,
      runId: result.run.id,
      caseId: result.run.caseId,
      pendingExtractIds: result.pendingExtractIds,
    };
  })) as LoadedRun;

  if (loaded.bail) {
    return { skipped: loaded.bail };
  }

  for (const sourceDocumentId of loaded.pendingExtractIds) {
    const extractResult = await step.run(`extract-${sourceDocumentId}`, async () => {
      if (env.HIVE_FAULT_INJECT === "extract-once" && !faultInjectedExtractDocs.has(sourceDocumentId)) {
        faultInjectedExtractDocs.add(sourceDocumentId);
        throw new Error("HIVE_FAULT_INJECT_EXTRACT_ONCE");
      }
      try {
        const source = await documents.loadIntakeSource(
          data.userId,
          loaded.caseId,
          sourceDocumentId,
        );
        const run = await deps.runs.getById(data.userId, loaded.runId);
        if (!run) {
          throw new Error("INTAKE_RUN_NOT_FOUND");
        }
        return await runIntakeExtractStep(deps, run, sourceDocumentId, source);
      } catch (error) {
        rethrowStepError(error);
      }
    });
    if (isIntakeNonRetriableErrorCode(extractResult.errorCode)) {
      throw new NonRetriableError(extractResult.errorCode ?? "INTAKE_NON_RETRIABLE");
    }
  }

  await step.run("identity-classification", async () => {
    const run = await deps.runs.getById(data.userId, loaded.runId);
    if (!run) {
      throw new Error("INTAKE_RUN_NOT_FOUND");
    }
    const identities = await deps.identities.listByRun(data.userId, loaded.runId);
    const sourcesById = new Map<
      string,
      Awaited<ReturnType<typeof documents.loadIntakeSource>> & object
    >();
    for (const identity of identities.filter((row) => row.processingStatus === "CLASSIFYING")) {
      const source = await documents.loadIntakeSource(
        data.userId,
        loaded.caseId,
        identity.sourceDocumentId,
      );
      if (source) {
        sourcesById.set(identity.sourceDocumentId, source);
      }
    }
    return runIntakeIdentityClassificationForRun(deps, run, sourcesById);
  });

  const packSummary = await step.run("pack-finalize", async () => {
    const run = await deps.runs.getById(data.userId, loaded.runId);
    if (!run) {
      throw new Error("INTAKE_RUN_NOT_FOUND");
    }
    if (run.packExecutionJson) {
      return {
        studyPath: run.studyPath,
        resolvedDomainId: run.resolvedDomainId,
        skipped: true as const,
      };
    }
    return { ...(await finalizeIntakeRunPackStep(deps, run)), skipped: false as const };
  });

  const completed = await step.run("complete", async () => {
    const run = await deps.runs.getById(data.userId, loaded.runId);
    if (!run) {
      throw new Error("INTAKE_RUN_NOT_FOUND");
    }
    if (isTerminalIntakeRunStatus(run.status)) {
      return { status: run.status, errorCode: run.errorCode };
    }
    const updated = await completeIntakeRunStatus(deps, run);
    return { status: updated.status, errorCode: updated.errorCode };
  });

  return { packSummary, completed };
}

export const hiveIntake = inngest.createFunction(
  {
    id: "hive-intake",
    concurrency: [
      { key: "event.data.userId", limit: 1 },
      { key: "\"global-intake\"", limit: GLOBAL_INTAKE_CONCURRENCY },
    ],
    triggers: [{ event: HIVE_EVENT_INTAKE_REQUESTED }],
    onFailure: async ({ event, step }) => {
      const intakeEvent = parseIntakeFailureEvent(event);
      if (!intakeEvent) {
        return { skipped: "not-intake-event" as const };
      }
      await step.run("mark-run-failed", async () => {
        const env = readWorkerEnv();
        const supabase = createWorkerAdminSupabase(env);
        const { deps } = buildWorkerIntakeDeps(supabase, env, intakeEvent.userId);
        await markIntakeRunWorkerFailed(deps, {
          userId: intakeEvent.userId,
          intakeRunId: intakeEvent.intakeRunId,
          errorCode: "INTAKE_WORKER_FAILED",
        });
      });
      return { marked: true as const };
    },
  },
  runHiveIntakeHandler,
);
