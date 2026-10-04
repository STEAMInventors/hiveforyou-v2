import { randomUUID } from "node:crypto";

import { buildCanonicalCaseSnapshot } from "@hiveforyou/canonical";
import type { CaseIntelligenceRepository } from "@hiveforyou/canonical";
import {
  getCaseMapProjectionByDomainId,
  getRecognitionVocabularyByDomainId,
  resolveDomainPackFromDiscoveryLabel,
  serializeRecognitionVocabularyForPrompt,
} from "@hiveforyou/domain-packs";

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
import {
  buildCaseProjectionsV3,
  persistCaseProjectionsV3,
} from "../projections/build-and-persist-projections-v3";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";
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
import type { CanonicalStudyEngineProposal } from "./engine-v3";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";
import { validateCanonicalStudyProposalV4 } from "./validate-proposal-v4";
import { voiceProposalForProjection } from "./extract-voice-proposal";
import { CANONICAL_STUDY_PROPOSAL_SCHEMA_V5 } from "@hiveforyou/shared/case-intelligence/3";
import { waitForTerminalStudyRun } from "./wait-for-terminal-study-run";
import type { StructureMap } from "@hiveforyou/shared/discover";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import { buildExtractionLocatorCatalog } from "../provenance/serialize-extraction-locator-catalog";
import { buildExtractionReadiness } from "./build-extraction-readiness";
import { enrichValidationWithExtractionReadiness } from "./apply-extraction-readiness";
import type { ExtractionReadiness } from "@hiveforyou/shared/intake/extraction-readiness";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

/** OpenAI intake studies can exceed two minutes; duplicate POSTs must wait, not restart. */
const STUDY_IN_PROGRESS_WAIT_MS = 600_000;

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
  loadStructureMapForIntakeRun?: (
    intakeRunId: string,
    caseId: string,
  ) => Promise<StructureMap | null>;
  loadSourceDocumentBytes?: StudySourceBytesLoader;
  loadNormalizedExtractionsForStudy?: (
    context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext,
  ) => Promise<Map<string, NormalizedDocumentExtraction>>;
  studyArtifactRepo?: StudyArtifactRepository;
  /** When set, runs client-writer/2 and merges copy into case-view/2 (Engine 2 pass 2). */
  clientWriterPass?: (input: {
    caseView: import("@hiveforyou/shared/projections").CaseViewV2;
    context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext;
  }) => Promise<import("@hiveforyou/shared/projections").CaseViewV2>;
  /** @deprecated Use clientWriterPass */
  clientSummaryPass?: StudyServiceDeps["clientWriterPass"];
  /** Optional skeleton→model→validator story writer (second model call when enabled). */
  storyWriterPass?: (input: {
    caseView: import("@hiveforyou/shared/projections").CaseViewV2;
    context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext;
    intelligence: CanonicalCaseSnapshot;
  }) => Promise<import("@hiveforyou/shared/projections").CaseViewV2>;
};

function fixturePersistenceBlocked(proposal: CanonicalStudyEngineProposal): boolean {
  return proposal.modelMetadata.proposalMode === "fixture" && !isCanonicalStudyTestEnvironment();
}

function validateStudyProposal(
  context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext,
  proposal: CanonicalStudyEngineProposal,
  promptVersion: string | undefined,
) {
  if (promptVersion === "v4") {
    return validateCanonicalStudyProposalV4(context, proposal);
  }
  return validateCanonicalStudyProposalV3(context, proposal as CanonicalStudyProposal);
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

async function completeValidatedStudyAfterProposal(input: {
  request: StartCanonicalStudyRequest;
  deps: StudyServiceDeps;
  context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext;
  validation: CanonicalStudyValidationResultV3;
  proposal: CanonicalStudyEngineProposal;
  run: CanonicalStudyRun;
  studyRunId: string;
  learningPrep?: StudyLearningPrepResult;
  extractionReadiness?: ExtractionReadiness | null;
}): Promise<CanonicalStudyOutcome> {
  const { request, deps, context, validation, proposal, learningPrep, extractionReadiness } = input;
  let { run, studyRunId } = input;

  const previousVersion = await deps.intelligenceRepo.getLatestVersion(request.caseId);
  const nextVersion = (previousVersion ?? 0) + 1;
  const snapshot = buildCanonicalCaseSnapshot(context, validation, nextVersion, {
    ...(extractionReadiness ? { extractionReadiness } : {}),
  });

  if (deps.projectionRepo) {
    try {
      const statedWorkPurpose = readStatedWorkPurpose(context.answerSnapshot.userContext);
      const voiceProposal = voiceProposalForProjection(context, proposal);
      const proposalSchema =
        voiceProposal !== null
          ? CANONICAL_STUDY_PROPOSAL_SCHEMA_V5
          : deps.prompt?.version === "v4"
            ? ("canonical-study-proposal/4" as const)
            : ("canonical-study-proposal/3" as const);
      let built = buildCaseProjectionsV3({
        intelligence: snapshot,
        customerContext: deps.customerContext,
        caseMapProjection: getCaseMapProjectionByDomainId(snapshot.domainId),
        statedWorkPurpose,
        logicalDocuments: context.logicalDocuments,
        proposalSchema,
        voiceProposal,
        userText: statedWorkPurpose ?? context.answerSnapshot.analysisIntent?.label ?? "",
      });
      const writerPass = deps.clientWriterPass ?? deps.clientSummaryPass;
      if (writerPass) {
        const caseView = await writerPass({
          caseView: built.caseView,
          context,
        });
        built = { ...built, caseView };
      }
      if (deps.storyWriterPass) {
        const caseView = await deps.storyWriterPass({
          caseView: built.caseView,
          context,
          intelligence: snapshot,
        });
        built = { ...built, caseView };
      }
      await persistCaseProjectionsV3(deps.projectionRepo, {
        intelligence: snapshot,
        customerContext: deps.customerContext,
        caseMapProjection: getCaseMapProjectionByDomainId(snapshot.domainId),
        statedWorkPurpose: readStatedWorkPurpose(context.answerSnapshot.userContext),
        logicalDocuments: context.logicalDocuments,
        proposalSchema,
        builtOverride: built,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[canonical-study] projection_persist_failed", {
        caseId: request.caseId,
        studyRunId,
        detail,
      });
      const migrationHint =
        /case_projections_kind_check|case_view/i.test(detail)
          ? " Apply Supabase migration 20261002200000_case_projections_case_view.sql (supabase db push)."
          : "";
      const message =
        isCanonicalStudyTestEnvironment() || process.env.NODE_ENV === "development"
          ? `Could not persist case projections. ${detail}${migrationHint}`
          : `Could not persist case projections.${migrationHint}`;
      return failRun(deps, run, "PERSISTENCE_FAILURE", message);
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

  if (
    deps.prompt?.version !== "v3" &&
    deps.prompt?.version !== "v4"
  ) {
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
      errorMessage: "Canonical study prompt version is not supported.",
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

  if (existingRun?.status === "RUNNING") {
    const terminal = await waitForTerminalStudyRun(
      deps.runRepo,
      request.caseId,
      idempotencyKey,
      { timeoutMs: STUDY_IN_PROGRESS_WAIT_MS },
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
      existingRun,
      "PERSISTENCE_FAILURE",
      "Timed out waiting for the in-progress study run.",
    );
  }

  if (existingRun?.status === "FAILED" && deps.studyArtifactRepo && deps.projectionRepo) {
    const artifact = await deps.studyArtifactRepo.getByStudyRunId(existingRun.studyRunId);
    const validationResult = artifact?.validationResultJson;
    if (
      artifact &&
      validationResult &&
      "status" in validationResult &&
      validationResult.status === "SUCCEEDED" &&
      artifact.rawProposalJson
    ) {
      const storedContext = await deps.contextRepo.getByStudyRunId(existingRun.studyRunId);
      if (storedContext) {
        console.info("[canonical-study] study_resumed_from_artifact", {
          caseId: request.caseId,
          studyRunId: existingRun.studyRunId,
        });
        return completeValidatedStudyAfterProposal({
          request,
          deps,
          context: storedContext,
          validation: validationResult as CanonicalStudyValidationResultV3,
          proposal: artifact.rawProposalJson as CanonicalStudyEngineProposal,
          run: { ...existingRun, status: "RUNNING" },
          studyRunId: existingRun.studyRunId,
        });
      }
    }
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
      { timeoutMs: STUDY_IN_PROGRESS_WAIT_MS },
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

  const storedContext = await deps.contextRepo.getByStudyRunId(studyRunId);
  const existingContext =
    storedContext &&
    storedContext.processingPolicy.promptSha256 === deps.prompt.sha256
      ? storedContext
      : null;
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
  const bindsStructureMap =
    Boolean(deps.loadStructureMap) || Boolean(deps.loadStructureMapForIntakeRun);

  if (bindsStructureMap) {
    let structureMap: StructureMap | null = null;
    if (request.discoveryRunId?.trim() && deps.loadStructureMap) {
      structureMap = await deps.loadStructureMap(request.discoveryRunId.trim());
    } else if (request.intakeRunId?.trim() && deps.loadStructureMapForIntakeRun) {
      structureMap = await deps.loadStructureMapForIntakeRun(
        request.intakeRunId.trim(),
        request.caseId,
      );
    } else {
      return failRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Structure Map binding requires a discovery run id or an intake run id.",
      );
    }
    if (!structureMap) {
      return failRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Structure Map could not be loaded for this study run.",
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

  let extractionLocatorCatalog = null;
  let extractionReadiness: ExtractionReadiness | null = null;
  if (deps.loadNormalizedExtractionsForStudy) {
    try {
      const extractions = await deps.loadNormalizedExtractionsForStudy(context);
      extractionLocatorCatalog = buildExtractionLocatorCatalog({ context, extractionsBySourceId: extractions });
      extractionReadiness = buildExtractionReadiness({ context, extractionsBySourceId: extractions });
    } catch {
      extractionLocatorCatalog = null;
      extractionReadiness = null;
    }
  }

  const recognitionVocabulary = serializeRecognitionVocabularyForPrompt(
    getRecognitionVocabularyByDomainId(context.domainId),
  );

  let proposal: CanonicalStudyEngineProposal;
  try {
    proposal = await deps.engine.study(context, {
      composed,
      sourceDocumentBytes,
      extractionLocatorCatalog,
      extractionReadiness,
      recognitionVocabulary:
        recognitionVocabulary.length > 0 ? recognitionVocabulary : null,
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
      const validation = validateStudyProposal(
        context,
        (error.proposal ?? {}) as CanonicalStudyEngineProposal,
        deps.prompt?.version,
      );
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

  let validation: CanonicalStudyValidationResultV3;
  try {
    validation = validateStudyProposal(context, proposal, deps.prompt?.version);
    validation = enrichValidationWithExtractionReadiness(validation, extractionReadiness, context);
  } catch (error) {
    if (error instanceof MalformedCanonicalStudyProposalError) {
      validation = {
        status: "FAILED",
        accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
        rejected: [
          {
            severity: "fatal",
            code: "MALFORMED_PROPOSAL",
            message: error.message,
          },
        ],
        warnings: [],
        unresolved: [],
        validationErrors: [],
        provenanceErrors: [],
        integrityErrors: [],
      };
    } else {
      throw error;
    }
  }
  const primaryValidationIssue =
    validation.validationErrors[0] ??
    validation.rejected[0] ??
    validation.integrityErrors[0] ??
    validation.provenanceErrors[0];
  console.info("[canonical-study] validation_completed", {
    caseId: request.caseId,
    studyRunId,
    validationStatus: validation.status,
    acceptedClaimCount: validation.accepted.claims.length,
    rejectedIssueCount: validation.rejected.length,
    validationErrorCount: validation.validationErrors.length,
    provenanceErrorCount: validation.provenanceErrors.length,
    primaryIssue: primaryValidationIssue?.message ?? null,
  });
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
      errorMessage: primaryValidationIssue?.message ?? "Proposal failed validation.",
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

  return completeValidatedStudyAfterProposal({
    request,
    deps,
    context,
    validation,
    proposal,
    run,
    studyRunId,
    learningPrep,
    extractionReadiness,
  });
}
