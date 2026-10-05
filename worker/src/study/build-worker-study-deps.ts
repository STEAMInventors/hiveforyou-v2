import "@hiveforyou/domain-packs";
import {
  createCanonicalStudyEngineFromEnv,
  enrichCaseViewWithValidatedStory,
  intakePackExecutionToStructureMap,
  loadCaseCustomerContextSnapshot,
  loadCanonicalStudyPrompt,
  parseStoryWriterEngine,
  resolveIntakeStudyDomain,
  type StudyServiceDeps,
} from "@hiveforyou/core";
import { readStatedWorkPurpose } from "@hiveforyou/shared/canonical-study";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkerEnv } from "../env.js";
import { createSupabaseHiveGateway } from "../persistence/hive-gateway.js";
import { SupabaseCaseProjectionRepository } from "../persistence/supabase-case-projections.js";
import { SupabaseStudyArtifactRepository } from "../persistence/supabase-study-artifacts.js";
import { createSupabaseDomainLearningPort } from "../persistence/supabase-domain-learning.js";
import {
  SupabaseCaseIntelligenceRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunEventRepository,
  SupabaseStudyRunRepository,
} from "../persistence/worker-supabase-repositories.js";
import { WorkerIntakeRepository } from "../persistence/worker-intake-repository.js";
import { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import { SupabaseCaseCustomerContextRepository } from "../persistence/worker-case-customer-context.js";
import {
  createWorkerOpenAiCallModel,
  createWorkerStoryWriterCallModel,
} from "./story-writer-call-model.js";

const CANONICAL_STUDY_PROMPT_ID = "canonical-study-v4";

function parseOptionalInt(raw: string | undefined): number | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildWorkerStudyDeps(
  supabase: SupabaseClient,
  env: WorkerEnv & {
    HIVE_CANONICAL_STUDY_ENGINE?: string;
    OPENAI_API_KEY?: string;
    HIVE_CANONICAL_STUDY_MODEL?: string;
    HIVE_OPENAI_MODEL?: string;
    HIVE_CANONICAL_STUDY_REASONING_EFFORT?: string;
    HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS?: string;
    HIVE_OPENAI_MAX_OUTPUT_TOKENS?: string;
    HIVE_STORY_WRITER_ENGINE?: string;
    HIVE_STORY_WRITER_MODEL?: string;
  },
  userId: string,
): {
  deps: StudyServiceDeps;
  intake: WorkerIntakeRepository;
  documents: WorkerSourceDocumentRepository;
  customerContextRepo: SupabaseCaseCustomerContextRepository;
} {
  const gateway = createSupabaseHiveGateway(supabase);
  const intake = new WorkerIntakeRepository(gateway, userId);
  const documents = new WorkerSourceDocumentRepository(gateway, userId);

  const prompt = loadCanonicalStudyPrompt(CANONICAL_STUDY_PROMPT_ID);
  const openAiCallModel = createWorkerOpenAiCallModel(env);
  const engineConfig = createCanonicalStudyEngineFromEnv(
    {
      engine: env.HIVE_CANONICAL_STUDY_ENGINE,
      openaiApiKey: env.OPENAI_API_KEY,
      model: env.HIVE_CANONICAL_STUDY_MODEL ?? env.HIVE_OPENAI_MODEL,
      reasoningEffort: env.HIVE_CANONICAL_STUDY_REASONING_EFFORT,
      maxOutputTokens: parseOptionalInt(
        env.HIVE_CANONICAL_STUDY_MAX_OUTPUT_TOKENS ?? env.HIVE_OPENAI_MAX_OUTPUT_TOKENS,
      ),
    },
    {
      promptVersion: prompt.version === "v4" ? "v4" : "v3",
      callModel: openAiCallModel,
    },
  );

  const storyMode = parseStoryWriterEngine(env.HIVE_STORY_WRITER_ENGINE);
  const callModel =
    storyMode === "openai" ? createWorkerStoryWriterCallModel(env) : undefined;

  const customerContextRepo = new SupabaseCaseCustomerContextRepository(gateway, userId);

  const deps: StudyServiceDeps = {
    engine: engineConfig.engine,
    providerId: engineConfig.providerId,
    providerMode: engineConfig.mode,
    modelId: engineConfig.modelId,
    prompt,
    customerContext: null,
    sessionUserId: userId,
    contextRepo: new SupabaseStudyContextRepository(gateway, userId),
    runRepo: new SupabaseStudyRunRepository(gateway, userId),
    eventRepo: new SupabaseStudyRunEventRepository(gateway, userId),
    intelligenceRepo: new SupabaseCaseIntelligenceRepository(gateway, userId),
    projectionRepo: new SupabaseCaseProjectionRepository(gateway, userId),
    studyArtifactRepo: new SupabaseStudyArtifactRepository(gateway, userId),
    domainLearning: createSupabaseDomainLearningPort(gateway, gateway, userId),
    loadStructureMapForIntakeRun: async (intakeRunId, caseId) => {
      const run = await intake.getById(userId, intakeRunId);
      if (!run?.packExecutionJson) {
        return null;
      }
      const { parsePackExecution } = await import("@hiveforyou/intake");
      const packExecution = parsePackExecution(run.packExecutionJson);
      if (!packExecution) {
        return null;
      }
      const domain = resolveIntakeStudyDomain({
        resolvedDomainId: run.resolvedDomainId,
        domainLabel: run.rawIntent ?? "Your documents",
      });
      if (!domain) {
        return null;
      }
      const identities = await intake.listByRun(userId, intakeRunId);
      const sources = (await documents.listByCase(userId, caseId)).map((doc) => ({
        id: doc.id,
        originalFilename: doc.originalFilename ?? "Document",
        sizeBytes: doc.sizeBytes ?? 0,
        mimeType: doc.mimeType,
        sha256: doc.sha256,
        storageBucket: doc.storageBucket,
        storagePath: doc.storagePath,
      }));
      const presentSourceIds = new Set(
        identities
          .filter((row) => row.analysisDisposition === "PRESENT")
          .map((row) => row.sourceDocumentId),
      );
      return intakePackExecutionToStructureMap({
        caseId,
        intakeRunId,
        domainId: domain.domainId,
        domainLabel: domain.domainLabel,
        domainPackId: domain.domainPackId,
        domainPackVersion: domain.domainPackVersion,
        packExecution,
        sources: sources as unknown as Parameters<
          typeof intakePackExecutionToStructureMap
        >[0]["sources"],
        presentSourceIds,
      });
    },
    loadSourceDocumentBytes: async (ref) => {
      if (!ref.storageBucket || !ref.storagePath) {
        throw new Error("MISSING_STORAGE_LOCATOR");
      }
      return gateway.downloadObject(ref.storageBucket, ref.storagePath);
    },
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
        const normalized = await intake.getBySourceHash(userId, primaryId, source.sha256);
        if (normalized?.normalizedExtraction) {
          extractions.set(primaryId, normalized.normalizedExtraction);
        }
      }
      return extractions;
    },
    storyWriterPass: async ({ caseView, context, intelligence }) =>
      enrichCaseViewWithValidatedStory({
        caseView,
        intelligence,
        mode: storyMode,
        model: env.HIVE_STORY_WRITER_MODEL,
        callModel,
        intent: (() => {
          const stated = readStatedWorkPurpose(context.answerSnapshot.userContext);
          if (stated) {
            return stated;
          }
          const label = context.answerSnapshot.analysisIntent?.label;
          return typeof label === "string" && label.trim().length > 0 ? label.trim() : null;
        })(),
      }),
  };

  return { deps, intake, documents, customerContextRepo };
}

export async function attachCaseCustomerContext(
  deps: StudyServiceDeps,
  customerContextRepo: SupabaseCaseCustomerContextRepository,
  caseId: string,
): Promise<StudyServiceDeps> {
  const customerContext = await loadCaseCustomerContextSnapshot(customerContextRepo, caseId);
  return { ...deps, customerContext };
}
