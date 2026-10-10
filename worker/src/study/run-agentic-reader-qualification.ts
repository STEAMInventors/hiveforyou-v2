import { randomUUID } from "node:crypto";

import {
  READER_EXPERIMENT_L001_MAX_REASONING_STEPS,
  READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
  buildL001QualificationSourceDocumentIdToFilename,
  resolveReaderArchitectureVariant,
} from "@hiveforyou/core/study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { StudyReaderRequestWire } from "./document-pages-to-reader-request.js";
import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";
import {
  ensureAgenticReaderQualificationRun,
  type EnsureAgenticReaderQualificationRunResult,
} from "./ensure-agentic-reader-qualification-run.js";
import {
  resolveEngine1ReaderContext,
  serializeEngine1ReaderContext,
} from "./engine1-reader-context.js";
import {
  loadTrustedDocumentPageBundle,
  TrustedDocumentPagesError,
} from "./load-trusted-document-pages.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";
import { SupabaseStudyRunRepository } from "../persistence/worker-supabase-repositories.js";
import {
  readCompletedDiagnostics,
  resolveReaderQualificationFailureCode,
} from "./reader-qualification-diagnostics.js";

export type StudyReaderAuditWire = {
  studyRunId: string;
  attemptId: string;
  persisted: boolean;
  status: "persisted" | "not_configured" | "failed";
  errorCode?: string | null;
};

export type StudyReaderResponseWire = {
  schemaVersion: "study-reader/1";
  candidateFacts: unknown[];
  audit?: StudyReaderAuditWire | null;
};

export type ReaderHttpClient = (
  request: StudyReaderRequestWire,
) => Promise<StudyReaderResponseWire>;

export type RunAgenticReaderQualificationInput = {
  gateway: HiveGateway;
  documentPagesBucket: string;
  caseId: string;
  userId: string;
  env?: Record<string, string | undefined>;
  readerClient: ReaderHttpClient;
  now?: () => string;
};

export type RunAgenticReaderQualificationResult =
  | {
      outcome: "already_qualified";
      run: CanonicalStudyRun;
      ensure: EnsureAgenticReaderQualificationRunResult;
    }
  | {
      outcome: "succeeded";
      run: CanonicalStudyRun;
      attemptId: string;
      acceptedEvidenceEvents: number;
      ensure: EnsureAgenticReaderQualificationRunResult;
    }
  | {
      outcome: "failed";
      run: CanonicalStudyRun;
      attemptId: string;
      code: string;
      ensure: EnsureAgenticReaderQualificationRunResult;
    };

function isForceRetry(env: Record<string, string | undefined>): boolean {
  const raw = env.HIVE_AGENTIC_READER_QUALIFICATION_FORCE_RETRY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

async function loadTraceEvents(
  gateway: HiveGateway,
  input: { studyRunId: string; attemptId: string },
) {
  return gateway.selectWhere("agent_run_trace_events", {
    study_run_id: input.studyRunId,
    attempt_id: input.attemptId,
  });
}

function countAcceptedEvidence(events: Array<Record<string, unknown>>): number {
  return events.filter((row) => String(row.event_type) === "EVIDENCE_ACCEPTED").length;
}

function traceAttemptCorrelated(
  events: Array<Record<string, unknown>>,
  input: { studyRunId: string; attemptId: string; caseId: string; userId: string },
): boolean {
  if (events.length === 0) {
    return false;
  }
  const eventTypes = new Set(events.map((row) => String(row.event_type)));
  if (!eventTypes.has("STARTED") || !eventTypes.has("COMPLETED")) {
    return false;
  }
  return events.every(
    (row) =>
      String(row.study_run_id) === input.studyRunId &&
      String(row.attempt_id) === input.attemptId &&
      String(row.case_id) === input.caseId &&
      String(row.user_id) === input.userId,
  );
}

async function markRunStatus(input: {
  gateway: HiveGateway;
  userId: string;
  run: CanonicalStudyRun;
  status: CanonicalStudyRun["status"];
  errorCode?: CanonicalStudyRun["errorCode"];
  errorMessage?: string;
  completedAt?: string;
}): Promise<CanonicalStudyRun> {
  const repo = new SupabaseStudyRunRepository(input.gateway, input.userId);
  const next: CanonicalStudyRun = {
    ...input.run,
    status: input.status,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    completedAt: input.completedAt,
  };
  return repo.save(next);
}

export async function runAgenticReaderQualification(
  input: RunAgenticReaderQualificationInput,
): Promise<RunAgenticReaderQualificationResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? (() => new Date().toISOString());
  const ensure = await ensureAgenticReaderQualificationRun({
    gateway: input.gateway,
    caseId: input.caseId,
    userId: input.userId,
    env,
  });

  if (ensure.run.status === "SUCCEEDED" && !isForceRetry(env)) {
    return { outcome: "already_qualified", run: ensure.run, ensure };
  }

  let activeRun = ensure.run;
  if (activeRun.status === "RUNNING") {
    activeRun = await markRunStatus({
      gateway: input.gateway,
      userId: input.userId,
      run: activeRun,
      status: "FAILED",
      errorCode: "STUDY_WORKER_FAILED",
      errorMessage: "Superseded stale qualification attempt.",
      completedAt: now(),
    });
  }

  const running = await markRunStatus({
    gateway: input.gateway,
    userId: input.userId,
    run: activeRun,
    status: "RUNNING",
    errorCode: undefined,
    errorMessage: undefined,
    completedAt: undefined,
  });

  const attemptId = randomUUID();
  const caseId = running.caseId;
  const userId = input.userId;

  let readerResponse: StudyReaderResponseWire;
  const processingStarted = performance.now();
  try {
    const bundles = await loadTrustedDocumentPageBundle({
      gateway: input.gateway,
      bucket: input.documentPagesBucket,
      userId,
      documents: ensure.registeredDocuments,
    });
    const documentLoadMs = Math.round(performance.now() - processingStarted);
    const filenameMap = buildL001QualificationSourceDocumentIdToFilename(ensure.registeredDocuments);
    const pageCountBySource = new Map(
      bundles.map((bundle) => [
        bundle.sourceDocumentId,
        bundle.documentPages.pages.length,
      ]),
    );
    const engine1Context = await resolveEngine1ReaderContext({
      gateway: input.gateway,
      userId,
      caseId,
      domainId: ensure.prompt.artifact.domainId,
      domainPackId: ensure.prompt.artifact.domainPackId,
      domainPackVersion: ensure.prompt.artifact.domainPackVersion,
      registeredDocuments: ensure.registeredDocuments,
      filenameBySourceDocumentId: filenameMap,
      pageCountBySourceDocumentId: pageCountBySource,
    });
    const request = buildStudyReaderRequestFromTrustedPages({
      caseId,
      userId,
      domainId: ensure.prompt.artifact.domainId,
      studyRunId: running.studyRunId,
      attemptId,
      bundles,
      engine1ReaderContextJson: serializeEngine1ReaderContext(engine1Context),
      limits: resolveReaderArchitectureVariant(env)
        ? {
            maxToolCalls: READER_EXPERIMENT_L001_MAX_TOOL_CALLS,
            maxReasoningSteps: READER_EXPERIMENT_L001_MAX_REASONING_STEPS,
          }
        : undefined,
    });
    void documentLoadMs;
    readerResponse = await input.readerClient(request);
  } catch (error) {
    const code =
      error instanceof TrustedDocumentPagesError
        ? error.code
        : error instanceof Error
          ? "READER_HTTP_FAILED"
          : "READER_HTTP_FAILED";
    const failed = await markRunStatus({
      gateway: input.gateway,
      userId,
      run: running,
      status: "FAILED",
      errorCode: "STUDY_WORKER_FAILED",
      errorMessage: code,
      completedAt: now(),
    });
    return { outcome: "failed", run: failed, attemptId, code, ensure };
  }

  const audit = readerResponse.audit;
  if (!audit?.persisted || audit.status !== "persisted") {
    const failed = await markRunStatus({
      gateway: input.gateway,
      userId,
      run: running,
      status: "FAILED",
      errorCode: "STUDY_WORKER_FAILED",
      errorMessage: "READER_AUDIT_NOT_PERSISTED",
      completedAt: now(),
    });
    return { outcome: "failed", run: failed, attemptId, code: "READER_AUDIT_NOT_PERSISTED", ensure };
  }
  if (audit.attemptId !== attemptId || audit.studyRunId !== running.studyRunId) {
    const failed = await markRunStatus({
      gateway: input.gateway,
      userId,
      run: running,
      status: "FAILED",
      errorCode: "STUDY_WORKER_FAILED",
      errorMessage: "READER_AUDIT_CORRELATION_MISMATCH",
      completedAt: now(),
    });
    return {
      outcome: "failed",
      run: failed,
      attemptId,
      code: "READER_AUDIT_CORRELATION_MISMATCH",
      ensure,
    };
  }

  const traceEvents = await loadTraceEvents(input.gateway, {
    studyRunId: running.studyRunId,
    attemptId,
  });
  const acceptedEvidenceEvents = countAcceptedEvidence(traceEvents);
  const correlated = traceAttemptCorrelated(traceEvents, {
    studyRunId: running.studyRunId,
    attemptId,
    caseId,
    userId,
  });

  const diagnostics = readCompletedDiagnostics(traceEvents);
  const acceptedFromPayload = diagnostics?.acceptedFactCount ?? 0;
  const acceptedFacts = Math.max(acceptedFromPayload, acceptedEvidenceEvents);

  if (!correlated || acceptedFacts < 1) {
    const code = resolveReaderQualificationFailureCode({
      correlated,
      diagnostics,
      acceptedEvidenceEvents,
    });
    const failed = await markRunStatus({
      gateway: input.gateway,
      userId,
      run: running,
      status: "FAILED",
      errorCode: "STUDY_WORKER_FAILED",
      errorMessage: code,
      completedAt: now(),
    });
    return { outcome: "failed", run: failed, attemptId, code, ensure };
  }

  const succeeded = await markRunStatus({
    gateway: input.gateway,
    userId,
    run: running,
    status: "SUCCEEDED",
    completedAt: now(),
  });
  return {
    outcome: "succeeded",
    run: succeeded,
    attemptId,
    acceptedEvidenceEvents,
    ensure,
  };
}
