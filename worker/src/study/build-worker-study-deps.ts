import "@hiveforyou/domain-packs";
import {
  createCanonicalStudyEngineFromEnv,
  enrichCaseViewWithValidatedStory,
  intakePackExecutionToStructureMap,
  loadCaseCustomerContextSnapshot,
  isV4PromptVersion,
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
  isCanonicalStudyFixtureMode,
  readCanonicalStudyPassSettings,
  tryCreateCallModelFromEnv,
  warnLegacyModelEnvVars,
  wrapCallModelWithMetrics,
  type ModelCallMetrics,
} from "@hiveforyou/model-providers/env";

const CANONICAL_STUDY_PROMPT_ID = "canonical-study-v4.1";

export type WorkerStudyModelMetricsSink = {
  take: () => ModelCallMetrics | undefined;
  reset: () => void;
};

function createModelMetricsSink(): WorkerStudyModelMetricsSink & {
  record: (metrics: ModelCallMetrics) => void;
} {
  let pending: ModelCallMetrics | undefined;
  return {
    reset: () => {
      pending = undefined;
    },
    take: () => {
      const value = pending;
      pending = undefined;
      return value;
    },
    record: (metrics) => {
      pending = metrics;
    },
  };
}

function wrapEnvRecord(env: WorkerEnv): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
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
  modelMetrics: WorkerStudyModelMetricsSink;
} {
  const gateway = createSupabaseHiveGateway(supabase);
  const intake = new WorkerIntakeRepository(gateway, userId);
  const documents = new WorkerSourceDocumentRepository(gateway, userId);

  const envRecord = wrapEnvRecord(env);
  warnLegacyModelEnvVars(envRecord);
  const modelMetrics = createModelMetricsSink();
  const callModelBundle = tryCreateCallModelFromEnv(envRecord);
  const passSettings = readCanonicalStudyPassSettings(envRecord);
  const prompt = loadCanonicalStudyPrompt(CANONICAL_STUDY_PROMPT_ID);
  console.info(
    "[hive/prompt]",
    JSON.stringify({
      promptVersion: prompt.version,
      promptSha256: prompt.sha256.slice(0, 12),
      engine: isV4PromptVersion(prompt.version) ? "v4" : "v3",
    }),
  );

  const studyCallModel = callModelBundle
    ? wrapCallModelWithMetrics(callModelBundle.callModel, callModelBundle.provider, (metrics) =>
        modelMetrics.record(metrics),
      )
    : undefined;
  const storyCallModel =
    callModelBundle && parseStoryWriterEngine(env.HIVE_STORY_WRITER_ENGINE) === "openai"
      ? wrapCallModelWithMetrics(callModelBundle.callModel, callModelBundle.provider, (metrics) =>
          modelMetrics.record(metrics),
        )
      : undefined;

  const maxOutputTokens =
    passSettings.maxOutputTokens ?? callModelBundle?.maxOutputTokens;

  const engineConfig = createCanonicalStudyEngineFromEnv(
    {
      engine: isCanonicalStudyFixtureMode(envRecord) ? "fixture" : undefined,
      reasoningEffort: passSettings.reasoningEffort,
      maxOutputTokens,
    },
    {
      promptVersion: isV4PromptVersion(prompt.version) ? "v4" : "v3",
      callModel: studyCallModel,
      modelName: callModelBundle?.modelName,
    },
  );

  const storyMode = parseStoryWriterEngine(env.HIVE_STORY_WRITER_ENGINE);
  const callModel = storyCallModel;

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
        model: callModelBundle?.modelName,
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

  return { deps, intake, documents, customerContextRepo, modelMetrics };
}

export async function attachCaseCustomerContext(
  deps: StudyServiceDeps,
  customerContextRepo: SupabaseCaseCustomerContextRepository,
  caseId: string,
): Promise<StudyServiceDeps> {
  const customerContext = await loadCaseCustomerContextSnapshot(customerContextRepo, caseId);
  return { ...deps, customerContext };
}
