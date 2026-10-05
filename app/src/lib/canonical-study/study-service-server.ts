import "server-only";

import {
  assemblePersistedStudyRequest,
  createCanonicalStudyEngineFromEnv,
  loadCaseCustomerContextSnapshot,
  loadCanonicalStudyPrompt,
  requireSessionUserId,
  runCanonicalStudy,
  type CanonicalStudyOutcome,
  type StudyServiceDeps,
} from "@hiveforyou/core";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import { openAiCallModelFromEnv } from "@/lib/model/openai-call-model.server";
import { readServerEnv } from "@/lib/env/server-env";
import { enrichCaseViewWithValidatedStory } from "@/lib/story/story-writer-from-env.server";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";
import { CANONICAL_STUDY_PROMPT_ID } from "@/lib/canonical-study/canonical-study-config";
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
import { SupabaseDiscoverArtifactRepository } from "@/lib/persistence/supabase-discover";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
import type { StructureMap } from "@hiveforyou/shared/discover";
import { HIVE_STRUCTURE_MAP_SCHEMA } from "@hiveforyou/shared/discover";

const inFlight = new Map<string, Promise<CanonicalStudyOutcome>>();

export class CaseNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";

  constructor() {
    super("Case was not found for the authenticated user.");
    this.name = "CaseNotFoundError";
  }
}

export async function startCanonicalStudyFromRequest(
  request: StartCanonicalStudyRequest & { userId?: string },
): Promise<CanonicalStudyOutcome> {
  const env = readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
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
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const adminGateway = createSupabaseHiveGateway(createAdminSupabaseClient());
  const domainLearning = createSupabaseDomainLearningPort(
    gateway,
    adminGateway,
    sessionUserId,
  );
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, request.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const documents = new SupabaseSourceDocumentRepository(gateway, sessionUserId);
  const persistedDocuments = await documents.listByCase(sessionUserId, request.caseId);
  const snapshots = new SupabaseAnswerSnapshotRepository(gateway, sessionUserId);
  const savedSnapshot = await snapshots.save({
    caseId: request.caseId,
    questionSetId: request.answerSnapshot.questionSetId,
    snapshot: request.answerSnapshot,
  });
  const loadedSnapshot = await snapshots.getById(savedSnapshot.id);
  if (!loadedSnapshot) {
    throw new Error("ANSWER_SNAPSHOT_PERSISTENCE_FAILED");
  }

  const assembled = assemblePersistedStudyRequest({
    sessionUserId,
    browserSuppliedUserId: request.userId,
    caseId: request.caseId,
    documents: persistedDocuments,
    clientSourceDocuments: request.sourceDocuments,
    engine1Result: request.engine1Result,
    questionSet: request.questionSet,
    answerSnapshot: loadedSnapshot.snapshot,
    answerSnapshotId: loadedSnapshot.id,
    clientRequestId: request.clientRequestId,
  });
  const studyRequest = {
    caseId: assembled.caseId,
    discoveryRunId: request.discoveryRunId,
    sourceDocuments: assembled.sourceDocuments,
    engine1Result: assembled.engine1Result,
    questionSet: assembled.questionSet,
    answerSnapshot: assembled.answerSnapshot,
    answerSnapshotId: assembled.answerSnapshotId,
    clientRequestId: assembled.clientRequestId,
  };

  const discoverArtifacts = new SupabaseDiscoverArtifactRepository(gateway, sessionUserId);

  const caseCustomerContextRepo = new SupabaseCaseCustomerContextRepository(
    gateway,
    sessionUserId,
  );
  const customerContext = await loadCaseCustomerContextSnapshot(
    caseCustomerContextRepo,
    request.caseId,
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
    inFlight,
    sessionUserId,
    domainLearning,
    loadStructureMap: async (discoveryRunId: string): Promise<StructureMap | null> => {
      const artifact = await discoverArtifacts.getByDiscoverRunId(discoveryRunId);
      const raw = artifact?.structureMapJson;
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const map = raw as StructureMap;
      if (map.schemaVersion !== HIVE_STRUCTURE_MAP_SCHEMA) {
        return null;
      }
      return map;
    },
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
        intent: readStatedWorkPurpose(context.answerSnapshot.userContext),
      }),
  };

  console.info("[canonical-study] study_triggered", {
    caseId: studyRequest.caseId,
    providerMode: engineConfig.mode,
    providerId: engineConfig.providerId,
    modelId: engineConfig.modelId ?? null,
    promptVersion: prompt.version,
    expectedProposalSchema: "canonical-study-proposal/3",
    sourceDocumentCount: studyRequest.sourceDocuments.length,
  });

  const outcome = await runCanonicalStudy(studyRequest, deps);
  if (outcome.run.studyContextId !== "not-created") {
    await documents.attachStudyRun(sessionUserId, request.caseId, outcome.run.studyRunId);
  }
  if (outcome.run.domainId !== "unknown") {
    await cases.setDomain(sessionUserId, request.caseId, outcome.run.domainId);
  }
  return outcome;
}
