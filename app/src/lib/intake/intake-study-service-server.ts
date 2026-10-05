import "server-only";

import { randomUUID } from "node:crypto";

import {
  assembleIntakeStudyRequest,
  createCanonicalStudyEngineFromEnv,
  queueCanonicalStudyRun,
  intakePackExecutionToStructureMap,
  loadCaseCustomerContextSnapshot,
  loadCanonicalStudyPrompt,
  requireSessionUserId,
  resolveIntakeStudyDomain,
  runCanonicalStudy,
  type CanonicalStudyOutcome,
  type StudyServiceDeps,
} from "@hiveforyou/core";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";
import { computeIntakeWorkspaceReady } from "@hiveforyou/shared/intake";
import { openAiCallModelFromEnv } from "@/lib/model/openai-call-model.server";
import { enrichCaseViewWithValidatedStory } from "@/lib/story/story-writer-from-env.server";

import {
  parsePackExecution,
  refreshPackExecutionForStudy,
} from "@hiveforyou/intake";

import { CANONICAL_STUDY_PROMPT_ID } from "@/lib/canonical-study/canonical-study-config";
import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseAnswerSnapshotRepository,
  SupabaseCaseIntelligenceRepository,
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunEventRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { SupabaseCaseCustomerContextRepository } from "@/lib/persistence/supabase-case-customer-context";
import { SupabaseCaseProjectionRepository } from "@/lib/persistence/supabase-case-projections";
import { SupabaseStudyArtifactRepository } from "@/lib/persistence/supabase-study-artifacts";
import { createSupabaseDomainLearningPort } from "@/lib/persistence/supabase-domain-learning";
import { SupabaseIntakeRepository } from "@/lib/persistence/supabase-intake";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

import { loadNormalizedExtractionForSource } from "@/lib/evidence/load-normalized-extraction.server";

import { emitStudyRequestedEvent } from "@/lib/intake/emit-study-requested";
import { isInngestIntakePipeline } from "@/lib/intake/pipeline";

import { IntakeCaseNotFoundError } from "./intake-service-server";

const inlineInFlight = new Map<string, Promise<CanonicalStudyOutcome>>();
const inlineIntakeStudyInFlight = new Map<string, Promise<CanonicalStudyOutcome>>();

export class IntakeStudyNotReadyError extends Error {
  readonly code = "INTAKE_NOT_READY";

  constructor(message: string) {
    super(message);
    this.name = "IntakeStudyNotReadyError";
  }
}

export async function startIntakeCanonicalStudyFromRun(
  intakeRunId: string,
): Promise<CanonicalStudyOutcome> {
  if (isInngestIntakePipeline()) {
    return startIntakeCanonicalStudyFromRunInner(intakeRunId);
  }
  let execution = inlineIntakeStudyInFlight.get(intakeRunId);
  if (!execution) {
    execution = startIntakeCanonicalStudyFromRunInner(intakeRunId);
    inlineIntakeStudyInFlight.set(intakeRunId, execution);
  }
  try {
    return await execution;
  } finally {
    if (inlineIntakeStudyInFlight.get(intakeRunId) === execution) {
      inlineIntakeStudyInFlight.delete(intakeRunId);
    }
  }
}

async function startIntakeCanonicalStudyFromRunInner(
  intakeRunId: string,
): Promise<CanonicalStudyOutcome> {
  const env = readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const adminGateway = createSupabaseHiveGateway(createAdminSupabaseClient());
  const intake = new SupabaseIntakeRepository(gateway, sessionUserId);
  const run = await intake.getById(sessionUserId, intakeRunId);
  if (!run) {
    throw new IntakeCaseNotFoundError();
  }

  const identities = await intake.listByRun(sessionUserId, intakeRunId);
  const documents = new SupabaseSourceDocumentRepository(gateway, sessionUserId);
  const sources = await documents.listByCase(sessionUserId, run.caseId);

  const { NORMALIZED_EXTRACTION_SCHEMA_VERSION } = await import("@hiveforyou/shared/intake");
  const workspaceDocuments = await Promise.all(
    identities.map(async (identity) => {
      const source = sources.find((row) => row.id === identity.sourceDocumentId);
      let hasNormalizedExtraction = false;
      if (source) {
        const normalized = await intake.getBySourceHash(
          sessionUserId,
          source.id,
          source.sha256,
        );
        hasNormalizedExtraction =
          normalized !== null &&
          normalized.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
          normalized.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION;
      }
      return {
        sourceDocumentId: identity.sourceDocumentId,
        processingStatus: identity.processingStatus,
        errorCode: identity.errorCode,
        hasNormalizedExtraction,
      };
    }),
  );

  const workspaceReady = computeIntakeWorkspaceReady(run.status, workspaceDocuments);
  if (!workspaceReady) {
    throw new IntakeStudyNotReadyError("Documents are still being prepared for study.");
  }

  let packExecution = parsePackExecution(run.packExecutionJson);
  if (!packExecution) {
    throw new IntakeStudyNotReadyError("Domain pack execution is not available for this run.");
  }

  const domain = resolveIntakeStudyDomain({
    resolvedDomainId: run.resolvedDomainId,
    domainLabel: run.rawIntent ?? "Your documents",
  });
  if (!domain) {
    throw new IntakeStudyNotReadyError("Could not resolve a domain pack for this intake run.");
  }

  const refreshed = await refreshPackExecutionForStudy({
    resolvedDomainId: domain.domainId,
    identities,
    sources,
    loadNormalized: (sourceDocumentId, sourceHash) =>
      loadNormalizedExtractionForSource({
        intake,
        userId: sessionUserId,
        sourceHash,
        candidateSourceDocumentIds: [sourceDocumentId],
      }),
    onRefreshFailed: (info) => console.info("[intake-study] pack_refresh_failed", info),
  });
  if (refreshed) {
    packExecution = refreshed;
  }

  const studyRequest = assembleIntakeStudyRequest({
    caseId: run.caseId,
    intakeRunId: run.id,
    domainId: domain.domainId,
    domainLabel: domain.domainLabel,
    domainPackVersion: domain.domainPackVersion,
    packExecution,
    sources,
    identities: identities.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      analysisDisposition: row.analysisDisposition,
    })),
    statedWorkPurpose: run.rawIntent,
  });

  if (!studyRequest.sourceDocuments.length) {
    throw new IntakeStudyNotReadyError("No documents are included in analysis for study.");
  }

  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, run.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const snapshots = new SupabaseAnswerSnapshotRepository(gateway, sessionUserId);
  const savedSnapshot = await snapshots.save({
    caseId: run.caseId,
    questionSetId: studyRequest.answerSnapshot.questionSetId,
    snapshot: studyRequest.answerSnapshot,
  });
  const loadedSnapshot = await snapshots.getById(savedSnapshot.id);
  if (!loadedSnapshot) {
    throw new Error("ANSWER_SNAPSHOT_PERSISTENCE_FAILED");
  }

  const assembledRequest = {
    ...studyRequest,
    answerSnapshot: loadedSnapshot.snapshot,
    answerSnapshotId: loadedSnapshot.id,
  };

  const presentSourceIds = new Set(
    identities
      .filter((row) => row.analysisDisposition === "PRESENT")
      .map((row) => row.sourceDocumentId),
  );

  const prompt = loadCanonicalStudyPrompt(CANONICAL_STUDY_PROMPT_ID);
  const engineConfig = createCanonicalStudyEngineFromEnv(
    {
      engine: env.HIVE_CANONICAL_STUDY_ENGINE,
      openaiApiKey: env.OPENAI_API_KEY,
      model: env.HIVE_CANONICAL_STUDY_MODEL ?? env.HIVE_OPENAI_MODEL,
      reasoningEffort:
        env.HIVE_CANONICAL_STUDY_REASONING_EFFORT ?? env.HIVE_DISCOVER_REASONING_EFFORT,
      maxOutputTokens:
        env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS ?? env.HIVE_OPENAI_MAX_OUTPUT_TOKENS,
    },
    {
      promptVersion: prompt.version === "v4" ? "v4" : "v3",
      callModel: openAiCallModelFromEnv(env),
    },
  );

  const caseCustomerContextRepo = new SupabaseCaseCustomerContextRepository(
    gateway,
    sessionUserId,
  );
  const customerContext = await loadCaseCustomerContextSnapshot(
    caseCustomerContextRepo,
    run.caseId,
  );

  const deps: StudyServiceDeps = {
    engine: engineConfig.engine,
    providerId: engineConfig.providerId,
    providerMode: engineConfig.mode,
    modelId: engineConfig.modelId,
    prompt,
    customerContext,
    contextRepo: new SupabaseStudyContextRepository(gateway, sessionUserId),
    runRepo: new SupabaseStudyRunRepository(gateway, sessionUserId),
    eventRepo: new SupabaseStudyRunEventRepository(gateway, sessionUserId),
    intelligenceRepo: new SupabaseCaseIntelligenceRepository(gateway, sessionUserId),
    projectionRepo: new SupabaseCaseProjectionRepository(gateway, sessionUserId),
    studyArtifactRepo: new SupabaseStudyArtifactRepository(gateway, sessionUserId),
    inFlight: isInngestIntakePipeline() ? undefined : inlineInFlight,
    sessionUserId,
    domainLearning: createSupabaseDomainLearningPort(gateway, adminGateway, sessionUserId),
    loadStructureMapForIntakeRun: async () =>
      intakePackExecutionToStructureMap({
        caseId: run.caseId,
        intakeRunId: run.id,
        domainId: domain.domainId,
        domainLabel: domain.domainLabel,
        domainPackId: domain.domainPackId,
        domainPackVersion: domain.domainPackVersion,
        packExecution,
        sources,
        presentSourceIds,
      }),
    loadSourceDocumentBytes: async (ref) => {
      if (!ref.storageBucket || !ref.storagePath) {
        throw new Error("MISSING_STORAGE_LOCATOR");
      }
      return gateway.downloadObject(ref.storageBucket, ref.storagePath);
    },
    storyWriterPass: async ({ caseView, context, intelligence }) =>
      enrichCaseViewWithValidatedStory({
        caseView,
        intelligence,
        env,
        intent: (() => {
          const stated = readStatedWorkPurpose(context.answerSnapshot.userContext);
          if (stated) {
            return stated;
          }
          const label = context.answerSnapshot.analysisIntent?.label;
          return typeof label === "string" && label.trim().length > 0 ? label.trim() : null;
        })(),
      }),
    loadNormalizedExtractionsForStudy: async (context) => {
      const extractions = new Map<
        string,
        import("@hiveforyou/shared/intake").NormalizedDocumentExtraction
      >();
      for (const source of context.sourceDocuments) {
        const primaryId = source.sourceDocumentId ?? source.stagedDocumentId;
        if (!primaryId || !source.sha256) {
          continue;
        }
        const normalized = await loadNormalizedExtractionForSource({
          intake,
          userId: sessionUserId,
          sourceHash: source.sha256,
          candidateSourceDocumentIds: [
            primaryId,
            source.sourceDocumentId,
            source.stagedDocumentId,
            source.discoveryDocumentId,
          ].filter((id): id is string => Boolean(id)),
        });
        if (normalized) {
          extractions.set(primaryId, normalized);
        }
      }
      return extractions;
    },
  };

  console.info("[intake-study] study_triggered", {
    caseId: run.caseId,
    intakeRunId: run.id,
    providerMode: engineConfig.mode,
    promptVersion: prompt.version,
    sourceDocumentCount: assembledRequest.sourceDocuments.length,
  });

  if (isInngestIntakePipeline()) {
    const studyRunId = randomUUID();
    const queued = await queueCanonicalStudyRun(assembledRequest, deps, { studyRunId });
    if (queued.run.status === "QUEUED") {
      await emitStudyRequestedEvent(queued.run, sessionUserId);
    }
    if (queued.run.studyContextId !== "not-created") {
      await documents.attachStudyRun(sessionUserId, run.caseId, queued.run.studyRunId);
    }
    if (queued.run.domainId !== "unknown") {
      await cases.setDomain(sessionUserId, run.caseId, queued.run.domainId);
    }
    return queued;
  }

  const outcome = await runCanonicalStudy(assembledRequest, deps);
  if (outcome.run.studyContextId !== "not-created") {
    await documents.attachStudyRun(sessionUserId, run.caseId, outcome.run.studyRunId);
  }
  if (outcome.run.domainId !== "unknown") {
    await cases.setDomain(sessionUserId, run.caseId, outcome.run.domainId);
  }
  return outcome;
}
