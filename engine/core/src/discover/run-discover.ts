import { randomUUID } from "node:crypto";

import type { HiveDiscoverResult, HiveDiscoverRun } from "@hiveforyou/shared/discover";

import type { LoadedDiscoverPrompt } from "../prompts/load-discover-prompt";
import type { SourceDocumentRepository } from "../persistence/source-document-repository";
import type { SourceDocumentStorage } from "../persistence/source-document-storage";
import { composeDiscoverPromptInputs } from "./compose-discover-prompt-inputs";
import type { DiscoverEngineConfig } from "./engine";
import { buildDiscoverIdempotencyKey } from "./fingerprint";
import {
  resolveDiscoverRunIdForRetry,
  resolveDiscoverRunStartedAt,
} from "./resolve-discover-run-id";
import { mapValidatedProposalToDocumentDiscovery } from "./map-proposal-to-discovery";
import type {
  DiscoverArtifactRepository,
  DiscoverRunRepository,
} from "./repositories";
import type { RunDiscoverRequest } from "./types";
import { toDiscoverSourceInput } from "./types";
import {
  resolveActiveDiscoverPack,
  validateDiscoveryProposal,
} from "./validate-discovery-proposal";
import { isAdaptiveDiscoverPromptVersion } from "./adaptive-discover-mode";
import type { RunAdaptiveDiscoverDeps } from "./run-adaptive-discover";
import { runAdaptiveDiscover } from "./run-adaptive-discover";
import { persistDiscoverRun } from "./persist-discover-run";
import { saveDiscoverArtifact } from "./save-discover-artifact";

export type RunDiscoverDeps = {
  sessionUserId: string;
  engineConfig: DiscoverEngineConfig;
  prompt: LoadedDiscoverPrompt;
  documents: SourceDocumentRepository;
  storage: SourceDocumentStorage;
  runRepo: DiscoverRunRepository;
  artifactRepo: DiscoverArtifactRepository;
  generateDiscoverRunId?: () => string;
  adaptive?: Omit<
    RunAdaptiveDiscoverDeps,
    | "sessionUserId"
    | "engineConfig"
    | "prompt"
    | "documents"
    | "storage"
    | "runRepo"
    | "artifactRepo"
    | "generateDiscoverRunId"
  >;
};

function runStatusFromValidation(
  validationOk: boolean,
  domainStatus: string | undefined,
): HiveDiscoverRun["status"] {
  if (!validationOk) {
    return "FAILED";
  }
  if (domainStatus === "AMBIGUOUS" || domainStatus === "MULTI_DOMAIN") {
    return "NEEDS_REVIEW";
  }
  return "SUCCEEDED";
}

export async function runDiscover(
  request: RunDiscoverRequest,
  deps: RunDiscoverDeps,
): Promise<HiveDiscoverResult> {
  const adaptiveEnabled =
    deps.prompt.version === "v2" ||
    isAdaptiveDiscoverPromptVersion(deps.prompt.version) ||
    Boolean(deps.adaptive);
  if (adaptiveEnabled && deps.adaptive) {
    return runAdaptiveDiscover(request, {
      sessionUserId: deps.sessionUserId,
      engineConfig: deps.engineConfig,
      resolutionEngine: deps.adaptive.resolutionEngine,
      prompt: deps.prompt,
      resolutionPrompt: deps.adaptive.resolutionPrompt,
      documents: deps.documents,
      storage: deps.storage,
      runRepo: deps.runRepo,
      artifactRepo: deps.artifactRepo,
      questionRepo: deps.adaptive.questionRepo,
      answerRepo: deps.adaptive.answerRepo,
      caseCustomerContextRepo: deps.adaptive.caseCustomerContextRepo,
      generateDiscoverRunId: deps.generateDiscoverRunId,
    });
  }

  const idempotencyKey = buildDiscoverIdempotencyKey(
    request.caseId,
    request.sourceDocumentIds,
  );
  const existing = await deps.runRepo.getByIdempotencyKey(
    request.caseId,
    idempotencyKey,
  );
  if (existing?.status === "SUCCEEDED" || existing?.status === "NEEDS_REVIEW") {
    return {
      run: existing,
    };
  }

  const discoverRunId = resolveDiscoverRunIdForRetry(existing, deps.generateDiscoverRunId);
  const startedAt = resolveDiscoverRunStartedAt(existing, discoverRunId);
  let run: HiveDiscoverRun = {
    discoverRunId,
    caseId: request.caseId,
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
  };
  run = await persistDiscoverRun(deps.runRepo, run);

  if (!request.sourceDocumentIds.length) {
    run = {
      ...run,
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: "MISSING_SOURCE_DOCUMENTS",
      errorMessage: "No source documents were provided.",
    };
    run = await persistDiscoverRun(deps.runRepo, run);
    return { run };
  }

  const records = [];
  for (const sourceDocumentId of request.sourceDocumentIds) {
    const record = await deps.documents.getById(deps.sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== request.caseId) {
      run = {
        ...run,
        status: "FAILED",
        completedAt: new Date().toISOString(),
        errorCode: "MISSING_SOURCE_DOCUMENTS",
        errorMessage: "One or more source documents were not found.",
      };
      run = await persistDiscoverRun(deps.runRepo, run);
      return { run };
    }
    records.push(record);
  }

  const sourceInputs = records.map(toDiscoverSourceInput);
  const composed = composeDiscoverPromptInputs(deps.prompt, sourceInputs);
  const sourceDocumentBytes = new Map<string, Uint8Array>();
  for (const record of records) {
    const bytes = await deps.storage.get({
      bucket: record.storageBucket,
      path: record.storagePath,
    });
    sourceDocumentBytes.set(record.id, bytes);
  }

  let rawProposal;
  try {
    rawProposal = await deps.engineConfig.engine.discover({
      composed,
      sourceDocuments: sourceInputs,
      sourceDocumentBytes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider failed.";
    const errorCode =
      message === "DISCOVER_ENGINE_UNAVAILABLE"
        ? "DISCOVER_ENGINE_UNAVAILABLE"
        : message.startsWith("MALFORMED_PROPOSAL")
          ? "MALFORMED_PROPOSAL"
          : "PROVIDER_ERROR";
    run = {
      ...run,
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode,
      errorMessage: message,
    };
    run = await persistDiscoverRun(deps.runRepo, run);
    await saveDiscoverArtifact(deps.artifactRepo, run, deps.sessionUserId, {});
    return { run };
  }

  const validationResult = validateDiscoveryProposal(rawProposal, sourceInputs);
  const activePack = resolveActiveDiscoverPack(rawProposal);
  if (activePack) {
    run = {
      ...run,
      domainPackId: activePack.domainPackId,
      domainPackVersion: activePack.domainPackVersion,
    };
  }

  const status = runStatusFromValidation(
    validationResult.ok,
    validationResult.preservedDomainResolutionStatus,
  );

  if (!validationResult.ok) {
    run = {
      ...run,
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorCode: "VALIDATION_FAILED",
      errorMessage: "Discovery proposal failed validation.",
    };
    run = await persistDiscoverRun(deps.runRepo, run);
    await saveDiscoverArtifact(deps.artifactRepo, run, deps.sessionUserId, {
      rawProposalJson: rawProposal,
      validationResultJson: validationResult,
    });
    return { run, rawProposal, validationResult };
  }

  const documentDiscovery = activePack
    ? mapValidatedProposalToDocumentDiscovery(rawProposal, activePack, sourceInputs)
    : undefined;

  run = {
    ...run,
    status,
    completedAt: new Date().toISOString(),
  };
  run = await persistDiscoverRun(deps.runRepo, run);
  await saveDiscoverArtifact(deps.artifactRepo, run, deps.sessionUserId, {
    rawProposalJson: rawProposal,
    validationResultJson: validationResult,
    discoveryResultJson: documentDiscovery,
  });

  return {
    run,
    rawProposal,
    validationResult,
    documentDiscovery,
  };
}
