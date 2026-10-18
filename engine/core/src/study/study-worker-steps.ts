import { buildCanonicalCaseSnapshot } from "@hiveforyou/canonical";
import {
  getCaseMapProjectionByDomainId,
  getRecognitionVocabularyByDomainId,
  serializeRecognitionVocabularyForPrompt,
} from "@hiveforyou/domain-packs";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyRun, StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isTerminalStudyRunStatus } from "@hiveforyou/shared/canonical-study";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import { CANONICAL_STUDY_PROPOSAL_SCHEMA_V5 } from "@hiveforyou/shared/case-intelligence/3";
import type { StructureMap } from "@hiveforyou/shared/discover";

import {
  prepareStudyLearningArtifacts,
  recordPostValidationLearning,
  type StudyLearningPrepResult,
} from "../domain-learning";
import {
  buildCaseProjectionsV3,
  persistCaseProjectionsV3,
} from "../projections/build-and-persist-projections-v3";
import { composeCanonicalStudyPromptInputs } from "../prompts/compose-canonical-study-inputs";
import { isV4PromptVersion } from "../prompts/load-canonical-study-prompt";
import { buildExtractionLocatorCatalog } from "../provenance/serialize-extraction-locator-catalog";
import { enrichValidationWithExtractionReadiness } from "./apply-extraction-readiness";
import { buildExtractionReadiness } from "./build-extraction-readiness";
import { enrichStudyContextWithStructureMap } from "./enrich-study-context";
import { createStudyRunEvent } from "./event-repository";
import {
  freezeCanonicalStudyContext,
  resolveStudyProcessingMode,
} from "./freeze-context";
import {
  buildPackDrivenReaderIntentFingerprint,
  PACK_DRIVEN_READER_ORCHESTRATION_ID,
  READER_DELEGATED_PROVIDER_MODE,
  type ObservedReaderIdentitySummary,
  type ReaderPreflightSnapshot,
} from "./reader-engine-identity";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";

import { isDeclarativeStudyPackResolverEnabled } from "./declarative-pack-activation.js";
import { resolveStudyDeclarativePackBinding } from "./resolve-study-declarative-pack.js";
import { consolidateVerifiedReaderFacts } from "./consolidate-verified-reader-facts";
import { voiceProposalForProjection } from "./extract-voice-proposal";
import { loadStudySourceDocumentBytes } from "./load-study-source-bytes";
import type { CanonicalStudyEngineProposal } from "./engine-v3";
import {
  CanonicalStudyEngineUnavailableError,
  MalformedCanonicalStudyProposalError,
} from "./study-engine-errors";
import type { StudyServiceDeps } from "./run-canonical-study";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";
import { validateCanonicalStudyProposalV4 } from "./validate-proposal-v4";
import { createStudyArtifactProposePlaceholderValidation } from "./study-artifact-persistence";
import {
  buildStudyRawExtractionValidationResult,
  STUDY_RAW_EXTRACTION_ARTIFACT_SCHEMA_VERSION,
  type StudyRawExtractionArtifact,
  type StudyRawExtractionOutcome,
} from "./study-artifact-persistence";
import { isStudyNonRetriableErrorCode } from "./study-worker-non-retriable";

export type StudyWorkerEvent = {
  userId: string;
  caseId: string;
  intakeRunId: string;
  studyRunId: string;
};

export type StudyWorkerLoadResult =
  | { skipped: "missing" | "complete"; studyRunId: string }
  | {
      skipped: null;
      studyRunId: string;
      caseId: string;
      domainId: string;
    };

function validateStudyProposal(
  context: import("@hiveforyou/shared/canonical-study").CanonicalStudyContext,
  proposal: CanonicalStudyEngineProposal,
  promptVersion: string | undefined,
) {
  if (isV4PromptVersion(promptVersion ?? "")) {
    return validateCanonicalStudyProposalV4(context, proposal);
  }
  return validateCanonicalStudyProposalV3(context, proposal as CanonicalStudyProposal);
}

async function failWorkerRun(
  deps: StudyServiceDeps,
  run: CanonicalStudyRun,
  errorCode: import("@hiveforyou/shared/canonical-study").StudyRunErrorCode,
  message: string,
): Promise<never> {
  const completed: CanonicalStudyRun = {
    ...run,
    status: "FAILED",
    completedAt: new Date().toISOString(),
    errorCode,
    errorMessage: message,
  };
  await deps.runRepo.save(completed);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.failed", run.studyRunId, run.caseId, { errorCode }),
  );
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.completed", run.studyRunId, run.caseId, { status: "FAILED" }),
  );
  const err = new Error(message) as Error & { errorCode: string };
  err.errorCode = errorCode;
  throw err;
}

async function ensureStudyContext(
  deps: StudyServiceDeps,
  run: CanonicalStudyRun,
  request: import("@hiveforyou/shared/canonical-study").StartCanonicalStudyRequest,
  resolvedPack: NonNullable<
    ReturnType<
      typeof import("@hiveforyou/domain-packs").resolveDomainPackFromDiscoveryLabel
    >
  >,
) {
  const processingMode = resolveStudyProcessingMode(request);
  if (!deps.prompt && processingMode !== "pack_driven_v1") {
    await failWorkerRun(deps, run, "INVALID_STUDY_CONTEXT", "Canonical study prompt is required.");
  }
  const prompt = deps.prompt;
  let storedContext = await deps.contextRepo.getByStudyRunId(run.studyRunId);
  const existingContext =
    storedContext &&
    (processingMode === "pack_driven_v1"
      ? storedContext.processingPolicy.processingMode === "pack_driven_v1"
      : prompt &&
        storedContext.processingPolicy.promptSha256 === prompt.sha256)
      ? storedContext
      : null;

  let declarativeBinding: ReturnType<typeof resolveStudyDeclarativePackBinding> | null = null;
  if (processingMode === "pack_driven_v1" && isDeclarativeStudyPackResolverEnabled()) {
    try {
      declarativeBinding = resolveStudyDeclarativePackBinding({
        domainId: resolvedPack.domainId,
        existingBinding: existingContext?.processingPolicy.declarativePackBinding,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Declarative study pack binding failed.";
      await failWorkerRun(deps, run, "MISSING_DOMAIN_PACK", message);
    }
  }

  const declarativeProposalPackSha256 = declarativeBinding
    ? computeProposalPackContentSha256(
        declarativeBinding.selection.compiledProposalPack,
      ).toLowerCase()
    : undefined;
  const packDrivenIntent =
    processingMode === "pack_driven_v1"
      ? buildPackDrivenReaderIntentFingerprint({
          proposalPackContentSha256: declarativeProposalPackSha256,
        })
      : null;
  const readerPreflight =
    processingMode === "pack_driven_v1"
      ? ((await deps.resolveReaderPreflight?.()) ?? undefined)
      : undefined;

  const resolvedPackForRun = declarativeBinding
    ? {
        ...resolvedPack,
        domainPackVersion: declarativeBinding.binding.domainPackVersion,
      }
    : resolvedPack;

  let context =
    existingContext ??
    freezeCanonicalStudyContext({
      request,
      studyRunId: run.studyRunId,
      resolvedPack: resolvedPackForRun,
      idempotencyKey: run.idempotencyKey,
      providerId:
        processingMode === "pack_driven_v1"
          ? PACK_DRIVEN_READER_ORCHESTRATION_ID
          : deps.providerId,
      providerMode:
        processingMode === "pack_driven_v1"
          ? READER_DELEGATED_PROVIDER_MODE
          : deps.providerMode,
      prompt: processingMode === "pack_driven_v1" ? undefined : prompt,
      proposalPackContentSha256: packDrivenIntent?.promptSha256,
      readerCompilerVersion: packDrivenIntent?.readerCompilerVersion,
      readerPreflight,
      customerContext: deps.customerContext ?? undefined,
      declarativePackBinding: declarativeBinding?.binding,
    });

  if (
    processingMode === "pack_driven_v1" &&
    (run.providerMode !== READER_DELEGATED_PROVIDER_MODE ||
      run.providerId !== PACK_DRIVEN_READER_ORCHESTRATION_ID)
  ) {
    await deps.runRepo.save({
      ...run,
      providerId: PACK_DRIVEN_READER_ORCHESTRATION_ID,
      providerMode: READER_DELEGATED_PROVIDER_MODE,
    });
  }

  const uploadedSourceDocuments = context.sourceDocuments;
  let structureMap: StructureMap | null = null;
  if (processingMode === "pack_driven_v1") {
    if (deps.loadStructureMapForDiscoverRun && request.discoveryRunId?.trim()) {
      structureMap = await deps.loadStructureMapForDiscoverRun(
        request.discoveryRunId.trim(),
        request.caseId,
      );
    }
    if (!structureMap && deps.loadStructureMapForIntakeRun && request.intakeRunId?.trim()) {
      structureMap = await deps.loadStructureMapForIntakeRun(
        request.intakeRunId.trim(),
        request.caseId,
      );
    }
  } else if (deps.loadStructureMapForIntakeRun && request.intakeRunId?.trim()) {
    structureMap = await deps.loadStructureMapForIntakeRun(
      request.intakeRunId.trim(),
      request.caseId,
    );
  }
  if (structureMap) {
    context = enrichStudyContextWithStructureMap({
      context,
      structureMap: structureMap as StructureMap,
      engine1Result: request.engine1Result,
      customerContext: deps.customerContext,
    });
    context = { ...context, sourceDocuments: uploadedSourceDocuments };
  } else if (processingMode === "pack_driven_v1") {
    await failWorkerRun(
      deps,
      run,
      "INVALID_STUDY_CONTEXT",
      "Discover structure map is required for pack-driven study.",
    );
  }

  if (processingMode !== "pack_driven_v1") {
    if (!prompt) {
      await failWorkerRun(deps, run, "INVALID_STUDY_CONTEXT", "Canonical study prompt is required.");
      throw new Error("Canonical study prompt is required.");
    }
    const composedForBinding = composeCanonicalStudyPromptInputs(prompt, context);
    const frozenHash = context.processingPolicy.promptSha256;
    const promptMismatch =
      composedForBinding.prompt.version === "latest" ||
      composedForBinding.system !== prompt.content ||
      composedForBinding.prompt.sha256 !== prompt.sha256 ||
      (frozenHash !== undefined && frozenHash !== prompt.sha256);
    if (promptMismatch) {
      await failWorkerRun(
        deps,
        run,
        "INVALID_STUDY_CONTEXT",
        "Canonical study prompt could not be bound.",
      );
    }
  }

  if (!existingContext) {
    try {
      await deps.contextRepo.save(context);
    } catch {
      await failWorkerRun(deps, run, "PERSISTENCE_FAILURE", "Could not persist study context.");
    }
  }

  return context;
}

export async function runStudyWorkerLoadContext(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
  request: import("@hiveforyou/shared/canonical-study").StartCanonicalStudyRequest,
  resolvedPack: NonNullable<
    ReturnType<
      typeof import("@hiveforyou/domain-packs").resolveDomainPackFromDiscoveryLabel
    >
  >,
): Promise<StudyWorkerLoadResult> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  if (!run || run.caseId !== event.caseId) {
    return { skipped: "missing", studyRunId: event.studyRunId };
  }
  if (isTerminalStudyRunStatus(run.status)) {
    const version = run.caseIntelligenceVersion;
    if (version != null && deps.projectionRepo) {
      const caseMap = await deps.projectionRepo.getByVersionAndKind(
        run.caseId,
        version,
        "case_map",
      );
      const proView = await deps.projectionRepo.getByVersionAndKind(run.caseId, version, "pro");
      const caseView = await deps.projectionRepo.getByVersionAndKind(
        run.caseId,
        version,
        "case_view",
      );
      if (!caseMap || !proView || !caseView) {
        return {
          skipped: null,
          studyRunId: run.studyRunId,
          caseId: run.caseId,
          domainId: run.domainId,
        };
      }
    }
    return { skipped: "complete", studyRunId: event.studyRunId };
  }

  if (run.status === "QUEUED") {
    await deps.runRepo.save({ ...run, status: "RUNNING" });
  }

  await ensureStudyContext(deps, run, request, resolvedPack);

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.started", run.studyRunId, run.caseId, {
      idempotencyKey: run.idempotencyKey,
      domainId: run.domainId,
      promptId: run.promptId,
      promptVersion: run.promptVersion,
      promptSha256: run.promptSha256,
    }),
  );

  return {
    skipped: null,
    studyRunId: run.studyRunId,
    caseId: run.caseId,
    domainId: run.domainId,
  };
}

export async function runStudyWorkerProposeStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
  request: import("@hiveforyou/shared/canonical-study").StartCanonicalStudyRequest,
): Promise<{ artifactId: string; proposalSkipped?: boolean }> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  if (!run) {
    throw new Error("STUDY_RUN_NOT_FOUND");
  }
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  if (!context || !deps.prompt) {
    throw new Error("STUDY_CONTEXT_NOT_FOUND");
  }

  const existing = await deps.studyArtifactRepo?.getByStudyRunId(event.studyRunId);
  if (existing?.rawProposalJson) {
    return { artifactId: event.studyRunId, proposalSkipped: true };
  }

  if (deps.domainLearning && deps.sessionUserId) {
    await prepareStudyLearningArtifacts(deps.domainLearning, context, deps.sessionUserId);
  }

  const composed = composeCanonicalStudyPromptInputs(deps.prompt, context);
  let sourceDocumentBytes: Map<string, Uint8Array> | undefined;
  if (deps.providerMode === "openai" && deps.loadSourceDocumentBytes) {
    sourceDocumentBytes = await loadStudySourceDocumentBytes(context, deps.loadSourceDocumentBytes);
  }

  let extractionLocatorCatalog = null;
  let extractionReadiness = null;
  if (deps.loadNormalizedExtractionsForStudy) {
    const extractions = await deps.loadNormalizedExtractionsForStudy(context);
    extractionLocatorCatalog = buildExtractionLocatorCatalog({
      context,
      extractionsBySourceId: extractions,
    });
    extractionReadiness = buildExtractionReadiness({ context, extractionsBySourceId: extractions });
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
      recognitionVocabulary: recognitionVocabulary.length > 0 ? recognitionVocabulary : null,
    });
  } catch (error) {
    if (error instanceof MalformedCanonicalStudyProposalError) {
      if (isStudyNonRetriableErrorCode("MALFORMED_PROPOSAL")) {
        await failWorkerRun(deps, run, "MALFORMED_PROPOSAL", error.message);
      }
    }
    if (error instanceof CanonicalStudyEngineUnavailableError) {
      throw error;
    }
    throw new CanonicalStudyEngineUnavailableError(
      error instanceof Error ? error.message : "Engine 2 is unavailable.",
    );
  }

  await deps.studyArtifactRepo?.saveProposed({
    studyRunId: event.studyRunId,
    caseId: run.caseId,
    userId: event.userId,
    rawProposalJson: proposal,
    validationResultJson: createStudyArtifactProposePlaceholderValidation(),
  });

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.engine_completed", run.studyRunId, run.caseId, {
      domainId: context.domainId,
      modelId: proposal.modelMetadata.modelId ?? null,
      logicalDocumentCount: context.logicalDocuments.length,
      sourceDocumentCount: context.sourceDocuments.length,
      modelAttachedDocumentCount:
        deps.providerMode === "openai" && proposal.modelMetadata.proposalMode === "production"
          ? context.sourceDocuments.length
          : 0,
      proposalMode: proposal.modelMetadata.proposalMode,
      providerId: proposal.modelMetadata.providerId,
      acceptedClaimCount: null,
    }),
  );

  void request;
  void extractionReadiness;
  return { artifactId: event.studyRunId };
}

export async function runStudyWorkerValidateStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
): Promise<{
  status: string;
  acceptedClaimCount: number;
  conflictCount: number;
  missingInformationCount: number;
}> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  const artifact = await deps.studyArtifactRepo?.getByStudyRunId(event.studyRunId);
  if (!run || !context || !artifact?.rawProposalJson) {
    throw new Error("STUDY_VALIDATE_PREREQUISITE_MISSING");
  }

  const proposal = artifact.rawProposalJson as CanonicalStudyEngineProposal;
  let validation = validateStudyProposal(context, proposal, deps.prompt?.version);
  if (deps.loadNormalizedExtractionsForStudy) {
    const extractions = await deps.loadNormalizedExtractionsForStudy(context);
    const extractionReadiness = buildExtractionReadiness({ context, extractionsBySourceId: extractions });
    validation = enrichValidationWithExtractionReadiness(validation, extractionReadiness, context);
  }

  await deps.studyArtifactRepo?.saveValidated({
    studyRunId: event.studyRunId,
    caseId: run.caseId,
    userId: event.userId,
    rawProposalJson: proposal,
    validationResultJson: validation,
  });

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.validation_completed", run.studyRunId, run.caseId, {
      status: validation.status,
    }),
  );

  if (validation.status === "FAILED") {
    await failWorkerRun(
      deps,
      run,
      "MALFORMED_PROPOSAL",
      validation.validationErrors[0]?.message ?? "Proposal failed validation.",
    );
  }

  return {
    status: validation.status,
    acceptedClaimCount: validation.accepted.claims.length,
    conflictCount: validation.accepted.conflicts.length,
    missingInformationCount: validation.accepted.missingInformation.length,
  };
}

export async function runStudyWorkerProjectionsStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
): Promise<{ intelligenceVersion: number }> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  const artifact = await deps.studyArtifactRepo?.getByStudyRunId(event.studyRunId);
  if (!run || !context || !artifact?.validationResultJson) {
    throw new Error("STUDY_PROJECTIONS_PREREQUISITE_MISSING");
  }
  const validation = artifact.validationResultJson as CanonicalStudyValidationResultV3;
  if (validation.status === "FAILED") {
    throw new Error("STUDY_VALIDATION_NOT_READY");
  }

  const proposal = (artifact.rawProposalJson ?? {
    schemaVersion: "study-consolidation/1",
    packDriven: true,
  }) as CanonicalStudyEngineProposal;
  let nextVersion = run.caseIntelligenceVersion ?? null;
  let snapshot: CanonicalCaseSnapshot | null = null;
  if (nextVersion != null) {
    snapshot = (await deps.intelligenceRepo.getByVersion(
      run.caseId,
      nextVersion,
    )) as CanonicalCaseSnapshot | null;
  }
  if (!snapshot) {
    const previousVersion = await deps.intelligenceRepo.getLatestVersion(run.caseId);
    nextVersion = (previousVersion ?? 0) + 1;
    let extractionReadiness = null;
    if (deps.loadNormalizedExtractionsForStudy) {
      const extractions = await deps.loadNormalizedExtractionsForStudy(context);
      extractionReadiness = buildExtractionReadiness({ context, extractionsBySourceId: extractions });
    }
    snapshot = buildCanonicalCaseSnapshot(context, validation, nextVersion, {
      ...(extractionReadiness ? { extractionReadiness } : {}),
    });
  }

  if (!deps.projectionRepo) {
    throw new Error("PROJECTION_REPO_REQUIRED");
  }

  const statedWorkPurpose = readStatedWorkPurpose(context.answerSnapshot.userContext);
  const voiceProposal = voiceProposalForProjection(context, proposal);
  const proposalSchema =
    voiceProposal !== null
      ? CANONICAL_STUDY_PROPOSAL_SCHEMA_V5
      : isV4PromptVersion(deps.prompt?.version ?? "")
        ? ("canonical-study-proposal/4" as const)
        : ("canonical-study-proposal/3" as const);

  const built = buildCaseProjectionsV3({
    intelligence: snapshot,
    customerContext: deps.customerContext,
    caseMapProjection: getCaseMapProjectionByDomainId(snapshot.domainId),
    statedWorkPurpose,
    logicalDocuments: context.logicalDocuments,
    proposalSchema,
    voiceProposal,
    userText:
      statedWorkPurpose ??
      (typeof context.answerSnapshot.analysisIntent?.label === "string"
        ? context.answerSnapshot.analysisIntent.label
        : ""),
  });

  await persistCaseProjectionsV3(deps.projectionRepo, {
    intelligence: snapshot,
    customerContext: deps.customerContext,
    caseMapProjection: getCaseMapProjectionByDomainId(snapshot.domainId),
    statedWorkPurpose,
    logicalDocuments: context.logicalDocuments,
    proposalSchema,
    builtOverride: built,
  });

  if (nextVersion == null || !snapshot) {
    throw new Error("STUDY_PROJECTIONS_INTELLIGENCE_VERSION_MISSING");
  }

  const existingIntelligence = await deps.intelligenceRepo.getByVersion(run.caseId, nextVersion);
  if (!existingIntelligence) {
    await deps.intelligenceRepo.save(snapshot);
    await deps.runRepo.save({
      ...run,
      caseIntelligenceVersion: nextVersion,
    });
  }

  void event;
  return { intelligenceVersion: nextVersion };
}

export async function runStudyWorkerStoryStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
): Promise<{ storyPresent: boolean }> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  if (!run?.caseIntelligenceVersion || !deps.projectionRepo || !deps.storyWriterPass) {
    return { storyPresent: false };
  }

  const snapshot = await deps.intelligenceRepo.getByVersion(run.caseId, run.caseIntelligenceVersion);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  if (!snapshot || !context) {
    throw new Error("STUDY_STORY_PREREQUISITE_MISSING");
  }

  let caseView = (await deps.projectionRepo.getByVersionAndKind(
    run.caseId,
    snapshot.version,
    "case_view",
  )) as import("@hiveforyou/shared/projections").CaseViewV2 | null;

  if (!caseView) {
    return { storyPresent: false };
  }

  caseView = await deps.storyWriterPass({
    caseView,
    context,
    intelligence: snapshot as CanonicalCaseSnapshot,
  });

  await deps.projectionRepo.save({
    caseId: run.caseId,
    intelligenceVersion: snapshot.version,
    projectionKind: "case_view",
    schemaVersion: caseView.schemaVersion,
    projection: caseView,
  });

  return { storyPresent: caseView.validatedStory?.kind === "prose" };
}

export async function runStudyWorkerCompleteRawExtractionStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
  input: {
    attemptId: string;
    rawExtractionOutcome: StudyRawExtractionOutcome;
    succeededDocumentIds: readonly string[];
    failedDocumentIds: readonly string[];
    documentExtractionAttemptManifestPath?: string;
    documentExtractionStudyRunManifestPath?: string;
    audit: {
      persisted: boolean;
      status: string;
      errorCode?: string;
    };
    acceptedVerifierFactCount: number;
    promptSha256: string;
    observedReaderIdentity?: ObservedReaderIdentitySummary;
    readerPreflight?: ReaderPreflightSnapshot;
    now?: () => string;
  },
): Promise<{ status: StudyRunStatus }> {
  const now = input.now ?? (() => new Date().toISOString());

  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  if (!run || !context) {
    throw new Error("STUDY_RAW_EXTRACTION_COMPLETE_PREREQUISITE_MISSING");
  }

  const validation = buildStudyRawExtractionValidationResult({
    outcome: input.rawExtractionOutcome,
    failedDocumentIds: input.failedDocumentIds,
  });

  const artifact: StudyRawExtractionArtifact = {
    schemaVersion: STUDY_RAW_EXTRACTION_ARTIFACT_SCHEMA_VERSION,
    studyRunId: event.studyRunId,
    caseId: run.caseId,
    attemptId: input.attemptId,
    outcome: input.rawExtractionOutcome,
    succeededDocumentIds: [...input.succeededDocumentIds],
    failedDocumentIds: [...input.failedDocumentIds],
    documentExtractionAttemptManifestPath: input.documentExtractionAttemptManifestPath,
    documentExtractionStudyRunManifestPath: input.documentExtractionStudyRunManifestPath,
    audit: {
      persisted: input.audit.persisted,
      status: input.audit.status,
      errorCode: input.audit.errorCode,
    },
    acceptedVerifierFactCount: input.acceptedVerifierFactCount,
    ...(input.observedReaderIdentity
      ? { observedReaderIdentity: input.observedReaderIdentity }
      : {}),
    ...(input.readerPreflight ? { readerPreflight: input.readerPreflight } : {}),
    createdAt: now(),
  };

  await deps.studyArtifactRepo?.save({
    studyRunId: event.studyRunId,
    caseId: run.caseId,
    userId: event.userId,
    rawProposalJson: artifact,
    validationResultJson: validation,
  });

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.validation_completed", run.studyRunId, run.caseId, {
      status: validation.status,
      source: "pack_driven_raw_extraction",
    }),
  );

  const finalStatus: StudyRunStatus =
    input.rawExtractionOutcome === "succeeded" ? "SUCCEEDED" : "FAILED";
  const completed: CanonicalStudyRun = {
    ...run,
    status: finalStatus,
    completedAt: now(),
    promptSha256: input.promptSha256,
    errorCode: input.rawExtractionOutcome === "succeeded" ? undefined : "STUDY_WORKER_FAILED",
    errorMessage:
      input.rawExtractionOutcome === "succeeded"
        ? undefined
        : validation.validationErrors[0]?.message,
  };
  await deps.runRepo.save(completed);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.completed", run.studyRunId, run.caseId, {
      status: finalStatus,
      source: "pack_driven_raw_extraction",
      rawExtractionOutcome: input.rawExtractionOutcome,
      auditPersisted: input.audit.persisted,
      auditStatus: input.audit.status,
      acceptedVerifierFactCount: input.acceptedVerifierFactCount,
    }),
  );

  void context;
  return { status: finalStatus };
}

export async function runStudyWorkerCompleteStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
  learningPrep?: StudyLearningPrepResult,
): Promise<{ status: string }> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  const artifact = await deps.studyArtifactRepo?.getByStudyRunId(event.studyRunId);
  if (!run || !context || !artifact?.validationResultJson) {
    throw new Error("STUDY_COMPLETE_PREREQUISITE_MISSING");
  }
  const validation = artifact.validationResultJson as CanonicalStudyValidationResultV3;
  const finalStatus = validation.status === "SUCCEEDED" ? "SUCCEEDED" : "NEEDS_REVIEW";
  const version = run.caseIntelligenceVersion;
  const snapshot =
    version != null ? await deps.intelligenceRepo.getByVersion(run.caseId, version) : null;

  const completed: CanonicalStudyRun = {
    ...run,
    status: finalStatus,
    completedAt: new Date().toISOString(),
    caseIntelligenceVersion: version,
  };
  await deps.runRepo.save(completed);
  await deps.eventRepo.append(
    createStudyRunEvent("study_run.completed", run.studyRunId, run.caseId, {
      status: finalStatus,
      caseIntelligenceVersion: version ?? null,
    }),
  );

  if (deps.domainLearning && deps.sessionUserId && snapshot) {
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

  void event;
  return { status: finalStatus };
}

export async function runStudyWorkerConsolidateFromReaderStep(
  deps: StudyServiceDeps,
  event: StudyWorkerEvent,
  input: { acceptedFacts: import("@hiveforyou/shared/reader-accepted-facts").ReaderAcceptedFactsArtifact },
): Promise<{ status: string; acceptedClaimCount: number }> {
  const run = await deps.runRepo.getByStudyRunId(event.studyRunId);
  const context = await deps.contextRepo.getByStudyRunId(event.studyRunId);
  if (!run || !context) {
    throw new Error("STUDY_CONSOLIDATE_PREREQUISITE_MISSING");
  }

  const validation = consolidateVerifiedReaderFacts({
    context,
    acceptedFacts: input.acceptedFacts,
  });

  await deps.studyArtifactRepo?.saveValidated({
    studyRunId: event.studyRunId,
    caseId: run.caseId,
    userId: event.userId,
    rawProposalJson: {
      schemaVersion: "study-consolidation/1",
      packDriven: true,
      studyRunId: event.studyRunId,
    },
    validationResultJson: validation,
  });

  await deps.eventRepo.append(
    createStudyRunEvent("study_run.validation_completed", run.studyRunId, run.caseId, {
      status: validation.status,
      source: "pack_driven_consolidation",
    }),
  );

  if (validation.status === "FAILED") {
    await failWorkerRun(
      deps,
      run,
      "MALFORMED_PROPOSAL",
      validation.validationErrors[0]?.message ?? "Consolidation produced no valid claims.",
    );
  }

  return {
    status: validation.status,
    acceptedClaimCount: validation.accepted.claims.length,
  };
}

export { isStudyNonRetriableErrorCode };
