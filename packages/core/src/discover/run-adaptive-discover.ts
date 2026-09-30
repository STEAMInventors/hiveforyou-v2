import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import type {
  CustomerDiscoveryAnswer,
  DiscoverQuestion,
  HiveDiscoverProposalV2,
  HiveDiscoverResolutionProposalV1,
  HiveDiscoverResult,
  HiveDiscoverRun,
} from "@hiveforyou/shared/discover";
import { isDiscoverProposalV2 } from "@hiveforyou/shared/discover";
import type { LoadedDiscoverPrompt } from "../prompts/load-discover-prompt";
import type { LoadedDiscoverResolutionPrompt } from "../prompts/load-discover-resolution-prompt";
import type { CaseCustomerContextRepository } from "../persistence/case-customer-context-repository";
import {
  persistCaseCustomerContextIntake,
  readObjectiveTextFromContextRecord,
} from "../persistence/case-customer-context-repository";
import type { SourceDocumentRepository } from "../persistence/source-document-repository";
import type { SourceDocumentStorage } from "../persistence/source-document-storage";
import { buildCollectionUnderstanding } from "./collection-understanding";
import { buildStructureMap } from "./build-structure-map";
import type { MissingEvidenceDisposition } from "./check-pack-completeness";
import { composeDiscoverPromptInputs } from "./compose-discover-prompt-inputs";
import type { DiscoverEngineConfig, DiscoverResolutionEngine } from "./engine";
import { buildDiscoverIdempotencyKey } from "./fingerprint";
import { mapStructureMapToDocumentDiscovery } from "./map-structure-map-to-document-discovery";
import {
  createObjectiveQuestion,
  isObjectiveQuestion,
  readObjectiveTextFromAnswers,
} from "./objective-question";
import {
  resolveDiscoverRunIdForRetry,
  resolveDiscoverRunStartedAt,
} from "./resolve-discover-run-id";
import { resolutionFromValidatedProposal } from "./resolution-from-proposal";
import type {
  DiscoverArtifactRepository,
  DiscoverRunRepository,
} from "./repositories";
import type {
  DiscoverCustomerAnswerRepository,
  DiscoverQuestionRepository,
} from "./repositories-adaptive";
import type { RunDiscoverRequest } from "./types";
import { toDiscoverSourceInput } from "./types";
import { validateCollectionUnderstandingV2 } from "./validate-collection-understanding-v2";
import { validateDiscoveryProposalV2 } from "./validate-discovery-proposal-v2";
import { resolveActiveDiscoverPack } from "./validate-discovery-proposal";
import { validateResolutionProposal } from "./validate-resolution-proposal";
import { mapValidatedClarificationQuestions } from "./validate-clarification-questions";
import { persistDiscoverRun } from "./persist-discover-run";
import { saveDiscoverArtifact } from "./save-discover-artifact";

function logAdaptiveDiscoverBoundary(boundary: string, detail?: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  if (detail) {
    console.info(`[discover:adaptive] ${boundary}`, detail);
  } else {
    console.info(`[discover:adaptive] ${boundary}`);
  }
}

export type RunAdaptiveDiscoverDeps = {
  sessionUserId: string;
  engineConfig: DiscoverEngineConfig;
  resolutionEngine: DiscoverResolutionEngine;
  prompt: LoadedDiscoverPrompt;
  resolutionPrompt: LoadedDiscoverResolutionPrompt;
  documents: SourceDocumentRepository;
  storage: SourceDocumentStorage;
  runRepo: DiscoverRunRepository;
  artifactRepo: DiscoverArtifactRepository;
  questionRepo: DiscoverQuestionRepository;
  answerRepo: DiscoverCustomerAnswerRepository;
  caseCustomerContextRepo?: CaseCustomerContextRepository;
  generateDiscoverRunId?: () => string;
};

async function resolveCustomerObjectiveForDiscover(input: {
  deps: RunAdaptiveDiscoverDeps;
  caseId: string;
  questions: DiscoverQuestion[];
  answers: CustomerDiscoveryAnswer[];
}): Promise<string | null> {
  const repo = input.deps.caseCustomerContextRepo;
  if (repo) {
    const active = await repo.listActiveByCase(input.caseId);
    const lines = active.flatMap((row) => {
      if (row.contextType !== "OBJECTIVE") {
        return [];
      }
      const text = readObjectiveTextFromContextRecord(row);
      return text ? [`${row.domainId}: ${text}`] : [];
    });
    if (lines.length > 0) {
      return lines.join("\n");
    }
  }
  return readObjectiveTextFromAnswers(input.questions, input.answers);
}

function terminalStatuses(): HiveDiscoverRun["status"][] {
  return ["READY_FOR_STUDY", "SUCCEEDED", "FAILED"];
}

function runStatusFromStructure(completenessStatus: string): HiveDiscoverRun["status"] {
  if (completenessStatus === "missing_evidence") {
    return "NEEDS_EVIDENCE_INPUT";
  }
  return "READY_FOR_STUDY";
}

async function loadSources(request: RunDiscoverRequest, deps: RunAdaptiveDiscoverDeps) {
  const records = [];
  for (const sourceDocumentId of request.sourceDocumentIds) {
    const record = await deps.documents.getById(deps.sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== request.caseId) {
      throw new Error("MISSING_SOURCE_DOCUMENTS");
    }
    records.push(record);
  }
  const sourceInputs = records.map(toDiscoverSourceInput);
  const sourceDocumentBytes = new Map<string, Uint8Array>();
  for (const record of records) {
    const bytes = await deps.storage.get({
      bucket: record.storageBucket,
      path: record.storagePath,
    });
    sourceDocumentBytes.set(record.id, bytes);
  }
  return { records, sourceInputs, sourceDocumentBytes };
}

async function finalizeStructureMap(input: {
  deps: RunAdaptiveDiscoverDeps;
  run: HiveDiscoverRun;
  pack: DiscoverDomainPackSnapshot;
  resolution: HiveDiscoverResolutionProposalV1;
  domainGroups?: HiveDiscoverProposalV2["domainGroups"];
  sourceInputs: ReturnType<typeof toDiscoverSourceInput>[];
  customerAnswers: CustomerDiscoveryAnswer[];
  customerObjective?: string;
  dispositions?: MissingEvidenceDisposition[];
}) {
  let run = await persistDiscoverRun(input.deps.runRepo, input.run);
  const structureMap = buildStructureMap({
    discoverRunId: run.discoverRunId,
    caseId: run.caseId,
    pack: input.pack,
    resolution: input.resolution,
    domainGroups: input.domainGroups,
    sources: input.sourceInputs,
    customerAnswers: input.customerAnswers,
    customerObjective: input.customerObjective,
    promptVersion: input.deps.prompt.version,
    promptSha256: input.deps.prompt.sha256,
    providerId: input.deps.engineConfig.providerId,
    modelId: input.deps.engineConfig.modelId,
    resolutionPromptVersion: input.deps.resolutionPrompt.version,
    resolutionPromptSha256: input.deps.resolutionPrompt.sha256,
    dispositions: input.dispositions,
  });
  const documentDiscovery = mapStructureMapToDocumentDiscovery(structureMap, input.pack);
  const status = runStatusFromStructure(structureMap.completeness.status);
  run = await persistDiscoverRun(input.deps.runRepo, {
    ...run,
    status,
    phase: status === "NEEDS_EVIDENCE_INPUT" ? "AWAITING_EVIDENCE_DISPOSITIONS" : "COMPLETE",
    completedAt: new Date().toISOString(),
    domainPackId: input.pack.domainPackId,
    domainPackVersion: input.pack.domainPackVersion,
  });
  await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
    structureMapJson: structureMap,
    discoveryResultJson: documentDiscovery,
    resolutionProposalJson: input.resolution,
  });
  return {
    run,
    structureMap,
    documentDiscovery,
  };
}

async function listPendingQuestions(
  run: HiveDiscoverRun,
  deps: RunAdaptiveDiscoverDeps,
): Promise<DiscoverQuestion[]> {
  if (run.status === "NEEDS_OBJECTIVE_INPUT" || run.status === "NEEDS_DISCOVERY_INPUT") {
    return deps.questionRepo.listByDiscoverRunId(run.discoverRunId);
  }
  return [];
}

function resultFromArtifact(input: {
  run: HiveDiscoverRun;
  rawProposal?: HiveDiscoverProposalV2;
  validationResult?: HiveDiscoverResult["validationResult"];
  discoveryQuestions?: DiscoverQuestion[];
}): HiveDiscoverResult {
  return {
    run: input.run,
    rawProposal: input.rawProposal,
    validationResult: input.validationResult,
    collectionUnderstanding: input.rawProposal
      ? buildCollectionUnderstanding(input.rawProposal)
      : undefined,
    discoveryQuestions: input.discoveryQuestions,
  };
}

async function hydrateExistingAdaptiveRun(
  run: HiveDiscoverRun,
  deps: RunAdaptiveDiscoverDeps,
): Promise<HiveDiscoverResult> {
  const artifact = await deps.artifactRepo.getByDiscoverRunId(run.discoverRunId);
  const rawProposal = artifact?.rawProposalJson
    ? (artifact.rawProposalJson as HiveDiscoverProposalV2)
    : undefined;
  const discoveryQuestions = await listPendingQuestions(run, deps);
  return {
    run,
    rawProposal,
    validationResult: artifact?.validationResultJson as HiveDiscoverResult["validationResult"],
    collectionUnderstanding: rawProposal ? buildCollectionUnderstanding(rawProposal) : undefined,
    structureMap: artifact?.structureMapJson as HiveDiscoverResult["structureMap"],
    documentDiscovery: artifact?.discoveryResultJson as HiveDiscoverResult["documentDiscovery"],
    discoveryQuestions: discoveryQuestions.length ? discoveryQuestions : undefined,
  };
}

async function persistObjectiveGate(input: {
  deps: RunAdaptiveDiscoverDeps;
  run: HiveDiscoverRun;
  request: RunDiscoverRequest;
  collectionProposal: HiveDiscoverProposalV2;
}): Promise<HiveDiscoverResult> {
  const questions: DiscoverQuestion[] = input.collectionProposal.domainGroups.map((group) =>
    createObjectiveQuestion({
      domainId: group.domainId,
      suggestedObjectives: group.suggestedObjectives,
    }),
  );
  await input.deps.questionRepo.saveQuestions({
    discoverRunId: input.run.discoverRunId,
    caseId: input.request.caseId,
    userId: input.deps.sessionUserId,
    questions,
  });
  const run = await persistDiscoverRun(input.deps.runRepo, {
    ...input.run,
    status: "NEEDS_OBJECTIVE_INPUT",
    phase: "AWAITING_OBJECTIVE",
    completedAt: new Date().toISOString(),
    domainPackId: "unknown",
    domainPackVersion: "unknown",
  });
  return resultFromArtifact({
    run,
    rawProposal: input.collectionProposal,
    discoveryQuestions: questions,
  });
}

async function invokeDiscoverEngine(input: {
  deps: RunAdaptiveDiscoverDeps;
  sourceInputs: ReturnType<typeof toDiscoverSourceInput>[];
  sourceDocumentBytes: Map<string, Uint8Array>;
  customerObjective?: string;
  discoveryPhase: "collection_understanding" | "discovery_completion";
  priorCollectionProposal?: HiveDiscoverProposalV2;
}): Promise<unknown> {
  const composed = composeDiscoverPromptInputs(
    input.deps.prompt,
    input.sourceInputs,
    undefined,
    input.customerObjective,
    {
      discoveryPhase: input.discoveryPhase,
      priorCollectionProposalJson: input.priorCollectionProposal
        ? JSON.stringify(input.priorCollectionProposal)
        : undefined,
    },
  );
  return input.deps.engineConfig.engine.discover({
    composed,
    sourceDocuments: input.sourceInputs,
    sourceDocumentBytes: input.sourceDocumentBytes,
    discoveryPhase: input.discoveryPhase,
    priorCollectionProposal: input.priorCollectionProposal,
  });
}

async function executeCollectionUnderstandingCall1(input: {
  deps: RunAdaptiveDiscoverDeps;
  run: HiveDiscoverRun;
  request: RunDiscoverRequest;
  sourceInputs: ReturnType<typeof toDiscoverSourceInput>[];
  sourceDocumentBytes: Map<string, Uint8Array>;
}): Promise<HiveDiscoverResult> {
  let run = await persistDiscoverRun(input.deps.runRepo, {
    ...input.run,
    status: "RUNNING",
    phase: "MODEL_DISCOVERY",
    completedAt: undefined,
  });

  let rawProposal: unknown;
  try {
    rawProposal = await invokeDiscoverEngine({
      deps: input.deps,
      sourceInputs: input.sourceInputs,
      sourceDocumentBytes: input.sourceDocumentBytes,
      discoveryPhase: "collection_understanding",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider failed.";
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: message.startsWith("MALFORMED_PROPOSAL")
        ? "MALFORMED_PROPOSAL"
        : "PROVIDER_ERROR",
      errorMessage: message,
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {});
    return { run };
  }

  run = { ...run, phase: "VALIDATING" };
  run = await persistDiscoverRun(input.deps.runRepo, run);
  const validationResult = validateCollectionUnderstandingV2(rawProposal, input.sourceInputs);
  // #region agent log
  fetch("http://127.0.0.1:7344/ingest/7ae07fd2-7632-4025-a5a9-82301d42c479", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4a15b7" },
    body: JSON.stringify({
      sessionId: "4a15b7",
      runId: "pre-fix",
      hypothesisId: "E",
      location: "run-adaptive-discover.ts:collection-validation",
      message: "collection understanding validation",
      data: {
        ok: validationResult.ok,
        issueCodes: validationResult.issues.map((issue) => issue.code),
        issuePaths: validationResult.issues.map((issue) => issue.path ?? ""),
        issueMessages: validationResult.issues.map((issue) => issue.message),
        isV2: isDiscoverProposalV2(rawProposal),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!validationResult.ok || !isDiscoverProposalV2(rawProposal)) {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Collection understanding failed validation.",
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
      rawProposalJson: rawProposal,
      validationResultJson: validationResult,
    });
    return {
      run,
      rawProposal: isDiscoverProposalV2(rawProposal) ? rawProposal : undefined,
      validationResult,
    };
  }

  const proposal = rawProposal;
  await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
    rawProposalJson: proposal,
    validationResultJson: validationResult,
  });
  return persistObjectiveGate({
    deps: input.deps,
    run,
    request: input.request,
    collectionProposal: proposal,
  });
}

async function executeDiscoveryCompletionCall2(input: {
  deps: RunAdaptiveDiscoverDeps;
  run: HiveDiscoverRun;
  request: RunDiscoverRequest;
  sourceInputs: ReturnType<typeof toDiscoverSourceInput>[];
  sourceDocumentBytes: Map<string, Uint8Array>;
  customerObjective: string;
  priorCollectionProposal: HiveDiscoverProposalV2;
}): Promise<HiveDiscoverResult> {
  let run = await persistDiscoverRun(input.deps.runRepo, {
    ...input.run,
    status: "RUNNING",
    phase: "MODEL_DISCOVERY",
    completedAt: undefined,
  });

  let rawProposal: unknown;
  try {
    rawProposal = await invokeDiscoverEngine({
      deps: input.deps,
      sourceInputs: input.sourceInputs,
      sourceDocumentBytes: input.sourceDocumentBytes,
      customerObjective: input.customerObjective,
      discoveryPhase: "discovery_completion",
      priorCollectionProposal: input.priorCollectionProposal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider failed.";
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: message.startsWith("MALFORMED_PROPOSAL")
        ? "MALFORMED_PROPOSAL"
        : "PROVIDER_ERROR",
      errorMessage: message,
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    return { run };
  }

  run = { ...run, phase: "VALIDATING" };
  run = await persistDiscoverRun(input.deps.runRepo, run);
  const validationResult = validateDiscoveryProposalV2(rawProposal, input.sourceInputs);
  if (!validationResult.ok || !isDiscoverProposalV2(rawProposal)) {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Discovery completion failed validation.",
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
      rawProposalJson: rawProposal,
      validationResultJson: validationResult,
    });
    return {
      run,
      rawProposal: isDiscoverProposalV2(rawProposal) ? rawProposal : undefined,
      validationResult,
    };
  }

  const proposal = rawProposal;
  const clarificationResult = mapValidatedClarificationQuestions(proposal);
  if (!clarificationResult.ok) {
    const failedValidation = {
      ok: false as const,
      issues: clarificationResult.issues,
      preservedDomainResolutionStatus: proposal.domainResolution.status,
    };
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Clarification questions failed validation.",
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
      rawProposalJson: proposal,
      validationResultJson: failedValidation,
    });
    return { run, rawProposal: proposal, validationResult: failedValidation };
  }

  const pack = resolveActiveDiscoverPack({
    schemaVersion: "hive-discover-proposal/1",
    domainResolution: proposal.domainResolution,
    logicalDocuments: proposal.logicalDocuments,
    relationships: proposal.relationships,
    missingExpectedDocuments: [],
  });
  if (!pack) {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Active discover pack could not be resolved.",
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    return { run, rawProposal: proposal, validationResult };
  }

  run = {
    ...run,
    domainPackId: pack.domainPackId,
    domainPackVersion: pack.domainPackVersion,
  };
  run = await persistDiscoverRun(input.deps.runRepo, run);
  await saveDiscoverArtifact(input.deps.artifactRepo, run, input.deps.sessionUserId, {
    rawProposalJson: proposal,
    validationResultJson: validationResult,
  });

  const discoveryQuestions = clarificationResult.questions;
  if (discoveryQuestions.length) {
    await input.deps.questionRepo.saveQuestions({
      discoverRunId: run.discoverRunId,
      caseId: input.request.caseId,
      userId: input.deps.sessionUserId,
      questions: discoveryQuestions,
    });
    run = {
      ...run,
      status: "NEEDS_DISCOVERY_INPUT",
      phase: "AWAITING_DISCOVERY_ANSWERS",
      completedAt: new Date().toISOString(),
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    return {
      run,
      rawProposal: proposal,
      validationResult,
      collectionUnderstanding: buildCollectionUnderstanding(input.priorCollectionProposal),
      discoveryQuestions,
    };
  }

  const resolution = resolutionFromValidatedProposal(proposal);
  const resolutionValidation = validateResolutionProposal(resolution, input.sourceInputs);
  if (!resolutionValidation.ok) {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Resolution failed validation.",
    };
    run = await persistDiscoverRun(input.deps.runRepo, run);
    return { run, rawProposal: proposal, validationResult: resolutionValidation };
  }

  const storedAnswers = await input.deps.answerRepo.listByDiscoverRunId(run.discoverRunId);
  logAdaptiveDiscoverBoundary("executeDiscoveryCompletionCall2:finalize-start", {
    discoverRunId: run.discoverRunId,
  });
  const finalized = await finalizeStructureMap({
    deps: input.deps,
    run,
    pack,
    resolution,
    domainGroups: proposal.domainGroups,
    sourceInputs: input.sourceInputs,
    customerAnswers: storedAnswers,
    customerObjective: input.customerObjective,
    dispositions: input.request.missingEvidenceDispositions,
  });
  logAdaptiveDiscoverBoundary("executeDiscoveryCompletionCall2:complete", {
    discoverRunId: finalized.run.discoverRunId,
    status: finalized.run.status,
    hasDocumentDiscovery: Boolean(finalized.documentDiscovery),
  });
  return {
    run: finalized.run,
    rawProposal: proposal,
    validationResult,
    collectionUnderstanding: buildCollectionUnderstanding(input.priorCollectionProposal),
    structureMap: finalized.structureMap,
    documentDiscovery: finalized.documentDiscovery,
    discoveryQuestions: [],
  };
}

export async function runAdaptiveDiscover(
  request: RunDiscoverRequest,
  deps: RunAdaptiveDiscoverDeps,
): Promise<HiveDiscoverResult> {
  if (request.discoverRunId) {
    return continueAdaptiveDiscover(request, deps);
  }
  const idempotencyKey = buildDiscoverIdempotencyKey(
    request.caseId,
    request.sourceDocumentIds,
  );
  const existing = await deps.runRepo.getByIdempotencyKey(
    request.caseId,
    idempotencyKey,
  );
  if (existing && !terminalStatuses().includes(existing.status)) {
    return hydrateExistingAdaptiveRun(existing, deps);
  }
  if (existing?.status === "READY_FOR_STUDY" || existing?.status === "SUCCEEDED") {
    return hydrateExistingAdaptiveRun(existing, deps);
  }
  const discoverRunId = resolveDiscoverRunIdForRetry(existing, deps.generateDiscoverRunId);
  const startedAt = resolveDiscoverRunStartedAt(existing, discoverRunId);
  let run: HiveDiscoverRun = {
    discoverRunId,
    caseId: request.caseId,
    intakeRunId: request.intakeRunId ?? null,
    idempotencyKey,
    providerId: deps.engineConfig.providerId,
    providerMode: deps.engineConfig.mode,
    modelId: deps.engineConfig.modelId,
    reasoningEffort: deps.engineConfig.reasoningEffort,
    promptId: deps.prompt.id,
    promptVersion: deps.prompt.version,
    promptSha256: deps.prompt.sha256,
    domainPackId: "unknown",
    domainPackVersion: "unknown",
    startedAt,
    status: "RUNNING",
    phase: "VERIFYING_SOURCES",
  };
  run = await persistDiscoverRun(deps.runRepo, run);
  if (!request.sourceDocumentIds.length) {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "MISSING_SOURCE_DOCUMENTS",
      errorMessage: "No source documents were provided.",
    };
    run = await persistDiscoverRun(deps.runRepo, run);
    return { run };
  }

  let sourceInputs: ReturnType<typeof toDiscoverSourceInput>[];
  let sourceDocumentBytes: Map<string, Uint8Array>;
  try {
    ({ sourceInputs, sourceDocumentBytes } = await loadSources(request, deps));
  } catch {
    run = {
      ...run,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "MISSING_SOURCE_DOCUMENTS",
      errorMessage: "One or more source documents were not found.",
    };
    run = await persistDiscoverRun(deps.runRepo, run);
    return { run };
  }

  return executeCollectionUnderstandingCall1({
    deps,
    run,
    request,
    sourceInputs,
    sourceDocumentBytes,
  });
}

async function continueAdaptiveDiscover(
  request: RunDiscoverRequest,
  deps: RunAdaptiveDiscoverDeps,
): Promise<HiveDiscoverResult> {
  const requestedDiscoverRunId = request.discoverRunId!;
  let run = await deps.runRepo.getByDiscoverRunId(requestedDiscoverRunId);
  if (!run || run.caseId !== request.caseId) {
    throw new Error("DISCOVER_RUN_NOT_FOUND");
  }
  if (run.status === "NEEDS_OBJECTIVE_INPUT") {
    return continueFromObjective(request, deps, run);
  }
  if (run.status !== "NEEDS_DISCOVERY_INPUT") {
    return hydrateExistingAdaptiveRun(run, deps);
  }
  return continueFromClarifications(request, deps, run);
}

async function continueFromObjective(
  request: RunDiscoverRequest,
  deps: RunAdaptiveDiscoverDeps,
  run: HiveDiscoverRun,
): Promise<HiveDiscoverResult> {
  const answers = request.customerAnswers ?? [];
  if (!answers.length) {
    return hydrateExistingAdaptiveRun(run, deps);
  }
  const questions = await deps.questionRepo.listByDiscoverRunId(run.discoverRunId);
  const artifact = await deps.artifactRepo.getByDiscoverRunId(run.discoverRunId);
  const prior = artifact?.rawProposalJson as HiveDiscoverProposalV2 | undefined;
  if (!prior || !isDiscoverProposalV2(prior)) {
    throw new Error("MISSING_COLLECTION_PROPOSAL");
  }

  if (request.caseCustomerContextIntake && deps.caseCustomerContextRepo) {
    await persistCaseCustomerContextIntake(deps.caseCustomerContextRepo, {
      userId: deps.sessionUserId,
      caseId: request.caseId,
      intake: request.caseCustomerContextIntake,
      suggestionsByDomainId: Object.fromEntries(
        prior.domainGroups.map((group) => [group.domainId, group.suggestedAudiences]),
      ),
    });
  }

  const objectiveText = await resolveCustomerObjectiveForDiscover({
    deps,
    caseId: request.caseId,
    questions,
    answers,
  });
  if (!objectiveText) {
    return hydrateExistingAdaptiveRun(run, deps);
  }

  await deps.answerRepo.appendAnswers(
    answers.map((answer) => ({
      ...answer,
      discoverRunId: run.discoverRunId,
      caseId: request.caseId,
      userId: deps.sessionUserId,
      intakeRunId: request.intakeRunId ?? run.intakeRunId,
    })),
  );

  const { sourceInputs, sourceDocumentBytes } = await loadSources(request, deps);
  logAdaptiveDiscoverBoundary("continueFromObjective:call2-start", {
    discoverRunId: run.discoverRunId,
  });
  return executeDiscoveryCompletionCall2({
    deps,
    run,
    request,
    sourceInputs,
    sourceDocumentBytes,
    customerObjective: objectiveText,
    priorCollectionProposal: prior,
  });
}

async function continueFromClarifications(
  request: RunDiscoverRequest,
  deps: RunAdaptiveDiscoverDeps,
  run: HiveDiscoverRun,
): Promise<HiveDiscoverResult> {
  const artifact = await deps.artifactRepo.getByDiscoverRunId(run.discoverRunId);
  const proposalRaw = artifact?.rawProposalJson;
  if (!proposalRaw || !isDiscoverProposalV2(proposalRaw)) {
    throw new Error("MISSING_DISCOVERY_PROPOSAL");
  }
  const proposal = proposalRaw;
  const answers = request.customerAnswers ?? [];
  if (!answers.length) {
    return hydrateExistingAdaptiveRun(run, deps);
  }
  await deps.answerRepo.appendAnswers(
    answers.map((answer) => ({
      ...answer,
      discoverRunId: run.discoverRunId,
      caseId: request.caseId,
      userId: deps.sessionUserId,
      intakeRunId: request.intakeRunId ?? run.intakeRunId,
    })),
  );
  const { sourceInputs, sourceDocumentBytes } = await loadSources(request, deps);
  const questions = await deps.questionRepo.listByDiscoverRunId(run.discoverRunId);
  const clarificationQuestions = questions.filter((item) => !isObjectiveQuestion(item));
  const storedAnswers = await deps.answerRepo.listByDiscoverRunId(run.discoverRunId);
  const customerObjective =
    (await resolveCustomerObjectiveForDiscover({
      deps,
      caseId: request.caseId,
      questions,
      answers: storedAnswers,
    })) ?? "Customer objective unavailable.";
  const clarificationAnswers = storedAnswers.filter((answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    return question && !isObjectiveQuestion(question);
  });
  const composed = composeDiscoverPromptInputs(
    deps.prompt,
    sourceInputs,
    undefined,
    customerObjective,
  );
  let runUpdating: HiveDiscoverRun = { ...run, status: "RUNNING", phase: "RESOLVING" };
  runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
  let resolution: HiveDiscoverResolutionProposalV1;
  try {
    resolution = await deps.resolutionEngine.resolveDiscovery({
      composed,
      priorProposal: proposal,
      discoverQuestions: clarificationQuestions,
      customerAnswers: clarificationAnswers,
      customerObjective,
      sourceDocuments: sourceInputs,
      sourceDocumentBytes,
      resolutionPrompt: deps.resolutionPrompt.content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider failed.";
    runUpdating = {
      ...runUpdating,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "PROVIDER_ERROR",
      errorMessage: message,
    };
    runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
    return { run: runUpdating };
  }
  runUpdating = { ...runUpdating, phase: "VALIDATING_RESOLUTION" };
  runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
  const resolutionValidation = validateResolutionProposal(resolution, sourceInputs);
  if (!resolutionValidation.ok) {
    runUpdating = {
      ...runUpdating,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Resolution failed validation.",
    };
    runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
    return {
      run: runUpdating,
      rawProposal: proposal,
      validationResult: resolutionValidation,
    };
  }
  const pack = resolveActiveDiscoverPack({
    schemaVersion: "hive-discover-proposal/1",
    domainResolution: resolution.domainResolution,
    logicalDocuments: resolution.logicalDocuments,
    relationships: resolution.relationships,
    missingExpectedDocuments: [],
  });
  if (!pack) {
    runUpdating = {
      ...runUpdating,
      status: "FAILED",
      phase: "COMPLETE",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Active discover pack could not be resolved.",
    };
    runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
    return { run: runUpdating, rawProposal: proposal };
  }
  runUpdating = { ...runUpdating, phase: "BUILDING_STRUCTURE_MAP" };
  runUpdating = await persistDiscoverRun(deps.runRepo, runUpdating);
  const allAnswers = await deps.answerRepo.listByDiscoverRunId(runUpdating.discoverRunId);
  logAdaptiveDiscoverBoundary("continueFromClarifications:finalize-start", {
    discoverRunId: runUpdating.discoverRunId,
  });
  const finalized = await finalizeStructureMap({
    deps,
    run: runUpdating,
    pack,
    resolution,
    domainGroups: proposal.domainGroups,
    sourceInputs,
    customerAnswers: allAnswers,
    customerObjective,
    dispositions: request.missingEvidenceDispositions,
  });
  logAdaptiveDiscoverBoundary("continueFromClarifications:complete", {
    discoverRunId: finalized.run.discoverRunId,
    status: finalized.run.status,
    hasDocumentDiscovery: Boolean(finalized.documentDiscovery),
  });
  return {
    run: finalized.run,
    rawProposal: proposal,
    structureMap: finalized.structureMap,
    documentDiscovery: finalized.documentDiscovery,
  };
}

