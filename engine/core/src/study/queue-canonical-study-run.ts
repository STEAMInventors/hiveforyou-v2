import { randomUUID } from "node:crypto";

import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";
import { isTerminalStudyRunStatus } from "@hiveforyou/shared/canonical-study";

import {
  buildIdempotencyKeyFromRequest,
  studyEngineFingerprintFromDeps,
} from "./freeze-context";
import { fingerprintAnswerSnapshot } from "./fingerprint";
import { persistStudyRun } from "./persist-study-run";
import { validateStudyReadiness } from "./readiness";
import type { CanonicalStudyOutcome } from "./run-canonical-study";
import type { StudyServiceDeps } from "./run-canonical-study";
import { resolveStudyRunIdForRetry, resolveStudyRunStartedAt } from "./resolve-study-run-id";
import { waitForTerminalStudyRun } from "./wait-for-terminal-study-run";

const STUDY_IN_PROGRESS_WAIT_MS = 600_000;

/** App path: persist a QUEUED study run and return without executing model steps. */
export async function queueCanonicalStudyRun(
  request: StartCanonicalStudyRequest,
  deps: StudyServiceDeps,
  input: { studyRunId: string },
): Promise<CanonicalStudyOutcome> {
  const readiness = validateStudyReadiness(request);
  if (!readiness.ok) {
    const stubRun: CanonicalStudyRun = {
      studyRunId: randomUUID(),
      caseId: request.caseId,
      idempotencyKey: "not-computed",
      studyContextId: "not-created",
      domainId: "unknown",
      domainPackId: "unknown",
      domainPackVersion: "unknown",
      questionSetVersion: request.questionSet.id,
      answerSnapshotHash: fingerprintAnswerSnapshot(request),
      providerId: deps.providerId,
      providerMode: deps.providerMode,
      startedAt: new Date().toISOString(),
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: readiness.errorCode,
      errorMessage: readiness.message,
    };
    return { run: stubRun, stage: "preparing", reusedExistingRun: false };
  }

  const resolvedPack = resolveDomainPackFromDiscoveryLabel(request.engine1Result.domainLabel);
  if (!resolvedPack || !deps.prompt) {
    const stubRun: CanonicalStudyRun = {
      studyRunId: randomUUID(),
      caseId: request.caseId,
      idempotencyKey: "not-computed",
      studyContextId: "not-created",
      domainId: resolvedPack?.domainId ?? "unknown",
      domainPackId: resolvedPack?.domainPackId ?? "unknown",
      domainPackVersion: resolvedPack?.domainPackVersion ?? "unknown",
      questionSetVersion: request.questionSet.id,
      answerSnapshotHash: fingerprintAnswerSnapshot(request),
      providerId: deps.providerId,
      providerMode: deps.providerMode,
      startedAt: new Date().toISOString(),
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: resolvedPack ? "INVALID_STUDY_CONTEXT" : "MISSING_DOMAIN_PACK",
      errorMessage: resolvedPack
        ? "Canonical study prompt is required."
        : "No domain pack resolves for this discovery label.",
    };
    return { run: stubRun, stage: "preparing", reusedExistingRun: false };
  }

  if (deps.providerMode === "unconfigured") {
    const engineFingerprint = studyEngineFingerprintFromDeps({
      providerMode: deps.providerMode,
      providerId: deps.providerId,
      modelId: deps.modelId,
      prompt: deps.prompt,
    });
    const idempotencyKey = buildIdempotencyKeyFromRequest(request, resolvedPack, engineFingerprint);
    const stubRun: CanonicalStudyRun = {
      studyRunId: randomUUID(),
      caseId: request.caseId,
      idempotencyKey,
      studyContextId: "not-created",
      domainId: resolvedPack.domainId,
      domainPackId: resolvedPack.domainPackId,
      domainPackVersion: resolvedPack.domainPackVersion,
      questionSetVersion: request.questionSet.id,
      answerSnapshotHash: fingerprintAnswerSnapshot(request),
      providerId: deps.providerId,
      providerMode: deps.providerMode,
      startedAt: new Date().toISOString(),
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: "ENGINE_UNAVAILABLE",
      errorMessage: "Canonical study engine is not configured.",
    };
    return { run: stubRun, stage: "preparing", reusedExistingRun: false };
  }

  const engineFingerprint = studyEngineFingerprintFromDeps({
    providerMode: deps.providerMode,
    providerId: deps.providerId,
    modelId: deps.modelId,
    prompt: deps.prompt,
  });
  const idempotencyKey = buildIdempotencyKeyFromRequest(request, resolvedPack, engineFingerprint);

  const existingRun = await deps.runRepo.getByIdempotencyKey(request.caseId, idempotencyKey);
  if (existingRun && isTerminalStudyRunStatus(existingRun.status)) {
    return { run: existingRun, stage: "complete", reusedExistingRun: true };
  }
  if (existingRun && (existingRun.status === "RUNNING" || existingRun.status === "QUEUED")) {
    const terminal = await waitForTerminalStudyRun(
      deps.runRepo,
      request.caseId,
      idempotencyKey,
      { timeoutMs: 5_000 },
    );
    if (terminal) {
      return { run: terminal, stage: "complete", reusedExistingRun: true };
    }
    return { run: existingRun, stage: "studying", reusedExistingRun: true };
  }

  const studyRunId =
    existingRun?.status === "FAILED"
      ? resolveStudyRunIdForRetry(existingRun, () => input.studyRunId)
      : input.studyRunId;

  const run: CanonicalStudyRun = {
    studyRunId,
    caseId: request.caseId,
    intakeRunId: request.intakeRunId,
    idempotencyKey,
    studyContextId: studyRunId,
    domainId: resolvedPack.domainId,
    domainPackId: resolvedPack.domainPackId,
    domainPackVersion: resolvedPack.domainPackVersion,
    questionSetVersion: request.questionSet.id,
    answerSnapshotHash: fingerprintAnswerSnapshot(request),
    providerId: deps.providerId,
    providerMode: deps.providerMode,
    promptId: deps.prompt.id,
    promptVersion: deps.prompt.version,
    promptSha256: deps.prompt.sha256,
    startedAt: resolveStudyRunStartedAt(existingRun, studyRunId),
    status: "QUEUED",
  };

  const persisted = await persistStudyRun(deps.runRepo, run);
  return {
    run: { ...run, studyRunId: persisted.run.studyRunId, startedAt: persisted.run.startedAt },
    stage: "preparing",
    reusedExistingRun: Boolean(existingRun),
  };
}
