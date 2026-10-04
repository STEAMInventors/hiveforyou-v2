import "server-only";

import {
  createDiscoverEngineFromEnv,
  createDiscoverResolutionEngineFromEnv,
  isAdaptiveDiscoverPromptVersion,
  loadDiscoverPrompt,
  loadDiscoverResolutionPrompt,
  requireSessionUserId,
  runDiscover,
  UnknownDiscoverPromptVersionError,
} from "@hiveforyou/core";
import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { CustomerDiscoveryAnswer, HiveDiscoverResult } from "@hiveforyou/shared/discover";

import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseDiscoverCustomerAnswerRepository,
  SupabaseDiscoverQuestionRepository,
} from "@/lib/persistence/supabase-discover-adaptive";
import {
  SupabaseDiscoverArtifactRepository,
  SupabaseDiscoverRunRepository,
} from "@/lib/persistence/supabase-discover";
import { SupabaseCaseCustomerContextRepository } from "@/lib/persistence/supabase-case-customer-context";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
} from "@/lib/persistence/supabase-repositories";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

export { UnknownDiscoverPromptVersionError };

export class CaseNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";

  constructor() {
    super("Case was not found for the authenticated user.");
    this.name = "CaseNotFoundError";
  }
}

export async function runDiscoverFromRequest(input: {
  caseId: string;
  sourceDocumentIds: string[];
  discoverRunId?: string;
  customerAnswers?: CustomerDiscoveryAnswer[];
  caseCustomerContextIntake?: CaseCustomerContextIntake;
}): Promise<HiveDiscoverResult> {
  const env = readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const prompt = loadDiscoverPrompt(env.HIVE_DISCOVER_PROMPT_VERSION);
  const adaptive = isAdaptiveDiscoverPromptVersion(env.HIVE_DISCOVER_PROMPT_VERSION);
  const engineConfig = createDiscoverEngineFromEnv(
    {
      engine: env.HIVE_DISCOVER_ENGINE,
      openaiApiKey: env.OPENAI_API_KEY,
      model: env.HIVE_DISCOVER_MODEL,
      reasoningEffort: env.HIVE_DISCOVER_REASONING_EFFORT,
    },
    { adaptiveV2: adaptive },
  );

  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());
  const adminGateway = createSupabaseHiveGateway(createAdminSupabaseClient());
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const ownedCase = await cases.getById(sessionUserId, input.caseId);
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const documents = new SupabaseSourceDocumentRepository(gateway, sessionUserId);
  const storage = new SupabaseSourceDocumentStorage(
    gateway,
    env.HIVE_STORAGE_BUCKET,
    sessionUserId,
  );

  const artifactRepo = new SupabaseDiscoverArtifactRepository(gateway, sessionUserId);
  const adaptiveDeps = adaptive
    ? {
        resolutionEngine: createDiscoverResolutionEngineFromEnv({
          engine: env.HIVE_DISCOVER_ENGINE,
          openaiApiKey: env.OPENAI_API_KEY,
          model: env.HIVE_DISCOVER_MODEL,
          reasoningEffort: env.HIVE_DISCOVER_REASONING_EFFORT,
        }).engine,
        resolutionPrompt: loadDiscoverResolutionPrompt(),
        questionRepo: new SupabaseDiscoverQuestionRepository(gateway, sessionUserId),
        answerRepo: new SupabaseDiscoverCustomerAnswerRepository(gateway, sessionUserId),
        caseCustomerContextRepo: new SupabaseCaseCustomerContextRepository(
          gateway,
          sessionUserId,
        ),
      }
    : undefined;

  return runDiscover(
    {
      caseId: input.caseId,
      sourceDocumentIds: input.sourceDocumentIds,
      discoverRunId: input.discoverRunId,
      customerAnswers: input.customerAnswers,
      caseCustomerContextIntake: input.caseCustomerContextIntake,
    },
    {
      sessionUserId,
      engineConfig,
      prompt,
      documents,
      storage,
      runRepo: new SupabaseDiscoverRunRepository(gateway, sessionUserId, adminGateway),
      artifactRepo,
      adaptive: adaptiveDeps,
    },
  );
}
