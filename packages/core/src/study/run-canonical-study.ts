import { randomUUID } from "node:crypto";

import { buildCanonicalCaseSnapshot } from "@hiveforyou/canonical";
import type { CaseIntelligenceRepository } from "@hiveforyou/canonical";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";

import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";
import type { StudyRunErrorCode } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { DomainLearningPort } from "../domain-learning";
import {
  prepareStudyLearningArtifacts,
  recordPostValidationLearning,
  type StudyLearningPrepResult,
} from "../domain-learning";
import type { CaseProjectionRepository } from "../persistence/case-projection-repository";
import { persistCaseProjectionsV3 } from "../projections/build-and-persist-projections-v3";
import type { LoadedCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { composeCanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";
import type { CanonicalStudyEngine } from "./engine";
import { enrichStudyContextWithStructureMap } from "./enrich-study-context";
import { createStudyRunEvent } from "./event-repository";
import type { StudyRunEventRepository } from "./event-repository";
import {
  buildIdempotencyKeyFromRequest,
  freezeCanonicalStudyContext,
  studyEngineFingerprintFromDeps,
} from "./freeze-context";
import { fingerprintAnswerSnapshot } from "./fingerprint";
import { isCanonicalStudyTestEnvironment } from "./fixture-persistence";
import { loadStudySourceDocumentBytes, type StudySourceBytesLoader } from "./load-study-source-bytes";
import { persistStudyRun } from "./persist-study-run";
import { validateStudyReadiness } from "./readiness";
import type { StudyContextRepository, StudyRunRepository } from "./repositories";
import {
  resolveStudyRunIdForRetry,
  resolveStudyRunStartedAt,
} from "./resolve-study-run-id";
import type { StudyArtifactRepository } from "./study-artifact-repository";
import {
  CanonicalStudyEngineUnavailableError,
  MalformedCanonicalStudyProposalError,
} from "./study-engine-errors";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";
import { waitForTerminalStudyRun } from "./wait-for-terminal-study-run";
import type { StructureMap } from "@hiveforyou/shared/discover";

export type StudyOrchestrationStage =
  | "preparing"
  | "studying"
  | "checking"
  | "validating"
  | "saving"
  | "complete";

export type CanonicalStudyOutcome = {
  run: CanonicalStudyRun;
  stage: StudyOrchestrationStage;
  reusedExistingRun: boolean;
};

export type StudyServiceDeps = {
  engine: CanonicalStudyEngine;
  providerId: string;
  providerMode: "fixture" | "openai" | "unconfigured";
  modelId?: string;
  contextRepo: StudyContextRepository;
  runRepo: StudyRunRepository;
  eventRepo: StudyRunEventRepository;
  intelligenceRepo: CaseIntelligenceRepository;
  projectionRepo?: CaseProjectionRepository;
  customerContext?: CaseCustomerContextSnapshot | null;
  prompt?: LoadedCanonicalStudyPrompt;
  inFlight?: Map<string, Promise<CanonicalStudyOutcome>>;
  generateStudyRunId?: () => string;
  sessionUserId?: string;
  domainLearning?: DomainLearningPort;
  loadStructureMap?: (discoveryRunId: string) => Promise<StructureMap | null>;
  loadSourceDocumentBytes?: StudySourceBytesLoader;
  studyArtifactRepo?: StudyArtifactRepository;
};

function fixturePersistenceBlocked(proposal: CanonicalStudyProposal): boolean {
  return proposal.modelMetadata.proposalMode === "fixture" && !isCanonicalStudyTestEnvironment();
}

async function persistStudyArtifact(
  deps: StudyServiceDeps,
  input: {
    studyRunId: string;
    caseId: string;
    proposal: CanonicalStudyProposal | null;
    validation: CanonicalStudyValidationResultV3;
  },
): Promise<void> {
  if (!deps.studyArtifactRepo || !deps.sessionUserId) {
    return;
  }
  await deps.studyArtifactRepo.save({
    studyRunId: input.studyRunId,
    caseId: input.caseId,
    userId: deps.sessionUserId,
    rawProposalJson: input.proposal,
    validationResultJson: input.validation,
  });
}

const defaultInFlight = new Map<string, Promise<CanonicalStudyOutcome>>();

function inFlightKey(caseId: string, idempotencyKey: string): string {
  return `${caseId}:${idempotencyKey}`;
}

async function failRun(
  deps: StudyServiceDeps,
  run: CanonicalStudyRun,
  errorCode: StudyRunErrorCode,
  message: string,
): Promise<CanonicalStudyOutcome> {
  const completed: CanonicalStudyRun = {
    ...run,
    status: "FAILED",
    completedAt: new Date().toISOString(),
    errorCode,
    errorMessage: message,
  };
  await deps.runRepo.save(completed);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.failed", run.studyRunId, run.caseId, {
      errorCode,
    }),
  );
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.completed", run.studyRunId, run.caseId, {
      status: "FAILED",
    }),
  );
  return { run: completed, stage: "complete", reusedExistingRun: false };
}

export async function runCanonicalStudy(
  request: StartCanonicalStudyRequest,
  deps: StudyServiceDeps,
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
    return { run: stubRun, stage: "complete", reusedExistingRun: false };
  }

  const resolvedPack = resolveDomainPackFromDiscoveryLabel(request.engine1Result.domainLabel);
  if (!resolvedPack) {
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
      errorCode: "MISSING_DOMAIN_PACK",
      errorMessage: "No domain pack resolves for this discovery label.",
    };
    return { run: stubRun, stage: "complete", reusedExistingRun: false };
  }

  if (deps.prompt?.version !== "v3") {
    const stubRun: CanonicalStudyRun = {
      studyRunId: randomUUID(),
      caseId: request.caseId,
      idempotencyKey: "not-computed",
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
      errorCode: "INVALID_STUDY_CONTEXT",
      errorMessage: "Canonical study requires the v3 prompt.",
    };
    return { run: stubRun, stage: "complete", reusedExistingRun: false };
  }

  const engineFingerprint = studyEngineFingerprintFromDeps({
    providerMode: deps.providerMode,
    providerId: deps.providerId,
    modelId: deps.modelId,
    prompt: deps.prompt,
  });

  if (deps.providerMode === "unconfigured") {
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
    return { run: stubRun, stage: "complete", reusedExistingRun: false };
  }

  const idempotencyKey = buildIdempotencyKeyFromRequest(request, resolvedPack, engineFingerprint);
  const flightMap = deps.inFlight ?? defaultInFlight;
  const flightKey = inFlightKey(request.caseId, idempotencyKey);
  let execution = flightMap.get(flightKey);
  const joinedInFlight = Boolean(execution);
  if (!execution) {
    execution = executeStudy(request, deps, resolvedPack, idempotencyKey);
    flightMap.set(flightKey, execution);
  }
  try {
    const outcome = await execution;
    return {
      ...outcome,
      reusedExistingRun: outcome.reusedExistingRun || joinedInFlight,
    };
  } finally {
    if (flightMap.get(flightKey) === execution) {
      flightMap.delete(flightKey);
    }
  }
}

async function executeStudy(
  request: StartCanonicalStudyRequest,
  deps: StudyServiceDeps,
  resolvedPack: NonNullable<ReturnType<typeof resolveDomainPackFromDiscoveryLabel>>,
  idempotencyKey: string,
): Promise<CanonicalStudyOutcome> {
  let existingRun = await deps.runRepo.getByIdempotencyKey(request.caseId, idempotencyKey);
  if (existingRun && (existingRun.status === "SUCCEEDED" || existingRun.status === "NEEDS_REVIEW")) {
    return {
      run: existingRun,
      stage: "complete",
      reusedExistingRun: true,
    };
  }

  let studyRunId = resolveStudyRunIdForRetry(
    existingRun?.status === "FAILED" ? existingRun : null,
    deps.generateStudyRunId,
  );

  if (!deps.prompt) {
    return failRun(
      deps,
      {
        studyRunId,
        caseId: request.caseId,
        idempotencyKey,
        studyContextId: studyRunId,
        domainId: resolvedPack.domainId,
        domainPackId: resolvedPack.domainPackId,
        domainPackVersion: resolvedPack.domainPackVersion,
        questionSetVersion: request.questionSet.id,
        answerSnapshotHash: fingerprintAnswerSnapshot(request),
        providerId: deps.providerId,
        providerMode: deps.providerMode,
        startedAt: resolveStudyRunStartedAt(existingRun, studyRunId),
        status: "RUNNING",
      },
      "INVALID_STUDY_CONTEXT",
      "Canonical study prompt is required.",
    );
  }

  let run: CanonicalStudyRun = {
    studyRunId,
    caseId: request.caseId,
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
    status: "RUNNING",
  };
  const persistedRun = await persistStudyRun(deps.runRepo, run);
  studyRunId = persistedRun.run.studyRunId;
  run = { ...run, studyRunId, startedAt: persistedRun.run.startedAt };
  existingRun = await deps.runRepo.getByIdempotencyKey(request.caseId, idempotencyKey);
  if (
    existingRun &&
    (existingRun.status === "SUCCEEDED" || existingRun.status === "NEEDS_REVIEW")
  ) {
    return {
      run: existingRun,
      stage: "complete",
      reusedExistingRun: true,
    };
  }
  if (persistedRun.joinedInProgress) {
    const terminal = await waitForTerminalStudyRun(
      deps.runRepo,
      request.caseId,
      idempotencyKey,
    );
    if (terminal) {
      return {
        run: terminal,
        stage: "complete",
        reusedExistingRun: true,
      };
    }
    return failRun(
      deps,
      run,
      "PERSISTENCE_FAILURE",
      "Timed out waiting for the in-progress study run.",
    );
  }

  const existingContext = await deps.contextRepo.getByStudyRunId(studyRunId);
  let context =
    existingContext ??
    freezeCanonicalStudyContext({
      request,
      studyRunId,
      resolvedPack,
      idempotencyKey,
      providerId: deps.providerId,
      providerMode: deps.providerMode,
      prompt: deps.prompt,
      customerContext: deps.customerContext ?? undefined,
    });

  const uploadedSourceDocuments = context.sourceDocuments;
  if (deps.loadStructureMap) {
    if (!request.discoveryRunId?.trim()) {
      return failRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Discovery run id is required to bind the Structure Map for study.",
      );
    }
    const structureMap = await deps.loadStructureMap(request.discoveryRunId);
    if (!structureMap) {
      return failRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Structure Map could not be loaded for the discovery run.",
      );
    }
    context = enrichStudyContextWithStructureMap({
      context,
      structureMap,
      engine1Result: request.engine1Result,
      customerContext: deps.customerContext,
    });
    context = {
      ...context,
      sourceDocuments: uploadedSourceDocuments,
    };
    if (
      structureMap.logicalDocuments.length > 0 &&
      context.logicalDocuments.length === 0
    ) {
      return failRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Structure Map logical documents could not be bound to the study context.",
      );
    }
  }

  const composedForBinding = composeCanonicalStudyPromptInputs(deps.prompt, context);
  const frozenHash = context.processingPolicy.promptSha256;
  const promptMismatch =
    composedForBinding.prompt.version === "latest" ||
    composedForBinding.system !== deps.prompt.content ||
    composedForBinding.prompt.sha256 !== deps.prompt.sha256 ||
    (frozenHash !== undefined && frozenHash !== deps.prompt.sha256);
  if (promptMismatch) {
    return failRun(deps, run, "INVALID_STUDY_CONTEXT", "Canonical study prompt could not be bound.");
  }

  if (!existingContext) {
    try {
      await deps.contextRepo.save(context);
    } catch {
      return failRun(deps, run, "PERSISTENCE_FAILURE", "Could not persist study context.");
    }
  }

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.started", studyRunId, request.caseId, {
      idempotencyKey,
      domainId: resolvedPack.domainId,
      promptId: run.promptId,
      promptVersion: run.promptVersion,
      promptSha256: run.promptSha256,
    }),
  );

  console.info("[canonical-study] study_started", {
    caseId: request.caseId,
    studyRunId,
    providerMode: deps.providerMode,
    proposalMode: deps.providerMode === "fixture" ? "fixture" : "production",
    modelId: deps.modelId ?? null,
    promptVersion: run.promptVersion ?? null,
    sourceDocumentCount: context.sourceDocuments.length,
  });

  let learningPrep: StudyLearningPrepResult | undefined;
  if (deps.domainLearning) {
    if (!deps.sessionUserId) {
      return failRun(
        deps,
        run,
        "PERSISTENCE_FAILURE",
        "Domain learning requires session user identity.",
      );
    }
    try {
      learningPrep = await prepareStudyLearningArtifacts(
        deps.domainLearning,
        context,
        deps.sessionUserId,
      );
    } catch {
      return failRun(
        deps,
        run,
        "PERSISTENCE_FAILURE",
        "Could not persist study learning artifacts.",
      );
    }
  }

  const composed = composeCanonicalStudyPromptInputs(deps.prompt, context);
  let sourceDocumentBytes: Map<string, Uint8Array> | undefined;
  if (deps.providerMode === "openai" && deps.loadSourceDocumentBytes) {
    try {
      sourceDocumentBytes = await loadStudySourceDocumentBytes(
        context,
        deps.loadSourceDocumentBytes,
      );
    } catch {
      return failRun(deps, run, "ENGINE_UNAVAILABLE", "Could not load source document bytes.");
    }
  }

  let proposal: CanonicalStudyProposal;
  try {
    proposal = await deps.engine.study(context, {
      composed,
      sourceDocumentBytes,
    });
    await deps.eventRepo.append(
      createStudyRunEvent("study_run.engine_completed", studyRunId, request.caseId, {
        domainId: context.domainId,
        modelId: proposal.modelMetadata.modelId ?? null,
        logicalDocumentCount: context.logicalDocuments.length,
        sourceDocumentCount: context.sourceDocuments.length,
        modelAttachedDocumentCount:
          deps.providerMode === "openai" &&
          proposal.modelMetadata.proposalMode === "production"
            ? context.sourceDocuments.length
            : 0,
        proposalMode: proposal.modelMetadata.proposalMode,
        providerId: proposal.modelMetadata.providerId,
        acceptedClaimCount: null,
      }),
    );
  } catch (error) {
    if (error instanceof MalformedCanonicalStudyProposalError) {
      const validation = validateCanonicalStudyProposalV3(context, error.proposal ?? {});
      await persistStudyArtifact(deps, {
        studyRunId,
        caseId: request.caseId,
        proposal: (error.proposal as CanonicalStudyProposal | undefined) ?? null,
        validation,
      });
      const failed: CanonicalStudyRun = {
        ...run,
        status: "FAILED",
        completedAt: new Date().toISOString(),
        errorCode: "MALFORMED_PROPOSAL",
        errorMessage: error.message,
      };
      await deps.runRepo.save(failed);
      if (deps.domainLearning && deps.sessionUserId) {
        await recordPostValidationLearning(
          deps.domainLearning,
          context,
          validation,
          null,
          deps.sessionUserId,
          "FAILED",
          learningPrep,
        );
      }
      return { run: failed, stage: "complete", reusedExistingRun: false };
    }
    const message =
      error instanceof CanonicalStudyEngineUnavailableError
        ? error.message
        : "Engine 2 is unavailable.";
    return failRun(deps, run, "ENGINE_UNAVAILABLE", message);
  }

  const validation = validateCanonicalStudyProposalV3(context, proposal);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.validation_completed", studyRunId, request.caseId, {
      status: validation.status,
    }),
  );

  try {
    await persistStudyArtifact(deps, {
      studyRunId,
      caseId: request.caseId,
      proposal,
      validation,
    });
  } catch {
    return failRun(deps, run, "PERSISTENCE_FAILURE", "Could not persist study artifact.");
  }

  if (validation.status === "FAILED") {
    const failed: CanonicalStudyRun = {
      ...run,
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: "MALFORMED_PROPOSAL",
      errorMessage: "Proposal failed validation.",
    };
    await deps.runRepo.save(failed);
    if (deps.domainLearning && deps.sessionUserId) {
      await recordPostValidationLearning(
        deps.domainLearning,
        context,
        validation,
        null,
        deps.sessionUserId,
        "FAILED",
        learningPrep,
      );
    }
    return { run: failed, stage: "complete", reusedExistingRun: false };
  }

  if (fixturePersistenceBlocked(proposal)) {
    return failRun(
      deps,
      run,
      "FIXTURE_MODE_NOT_ALLOWED",
      "Fixture canonical study proposals cannot be persisted outside test mode.",
    );
  }

  const previousVersion = await deps.intelligenceRepo.getLatestVersion(request.caseId);
  const nextVersion = (previousVersion ?? 0) + 1;
  const snapshot = buildCanonicalCaseSnapshot(context, validation, nextVersion);

  if (deps.projectionRepo) {
    try {
      await persistCaseProjectionsV3(deps.projectionRepo, {
        intelligence: snapshot,
        customerContext: deps.customerContext,
      });
    } catch {
      return failRun(deps, run, "PERSISTENCE_FAILURE", "Could not persist case projections.");
    }
  }

  try {
    await deps.intelligenceRepo.save(snapshot);
  } catch {
    return failRun(deps, run, "PERSISTENCE_FAILURE", "Could not persist case intelligence.");
  }

  const finalStatus = validation.status;
  const completed: CanonicalStudyRun = {
    ...run,
    status: finalStatus,
    completedAt: new Date().toISOString(),
    caseIntelligenceVersion: nextVersion,
  };
  await deps.runRepo.save(completed);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.completed", studyRunId, request.caseId, {
      status: finalStatus,
      caseIntelligenceVersion: nextVersion,
    }),
  );

  if (deps.domainLearning && deps.sessionUserId) {
    await recordPostValidationLearning(
      deps.domainLearning,
      context,
      validation,
      snapshot,
      deps.sessionUserId,
      finalStatus,
      learningPrep,
    );
  }

  return { run: completed, stage: "complete", reusedExistingRun: false };
}
