import {
  createDiscoverEngineFromEnv,
  createDiscoverResolutionEngineFromEnv,
  isAdaptiveDiscoverPromptVersion,
  loadDiscoverPrompt,
  loadDiscoverResolutionPrompt,
  type RunDiscoverDeps,
} from "@hiveforyou/core";

import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import { WorkerCaseCustomerContextRepository } from "../persistence/worker-case-customer-context.js";
import type { HiveGateway } from "../persistence/hive-gateway.js";
import {
  WorkerDiscoverArtifactRepository,
  WorkerDiscoverRunRepository,
} from "../persistence/worker-discover-repositories.js";
import {
  WorkerDiscoverCustomerAnswerRepository,
  WorkerDiscoverQuestionRepository,
} from "../persistence/worker-discover-adaptive.js";
import {
  workerDiscoverDocumentRepository,
  workerDiscoverDocumentStorage,
} from "./worker-discover-documents.js";

export function buildWorkerDiscoverDeps(input: {
  gateway: HiveGateway;
  documents: WorkerSourceDocumentRepository;
  userId: string;
  caseId: string;
  env: Record<string, string | undefined>;
}): { deps: RunDiscoverDeps; promptVersion: string } {
  const promptVersion = input.env.HIVE_DISCOVER_PROMPT_VERSION?.trim() || "discover-v2";
  const prompt = loadDiscoverPrompt(promptVersion);
  const adaptive = isAdaptiveDiscoverPromptVersion(prompt.version);
  const engineConfig = createDiscoverEngineFromEnv(input.env, { adaptiveV2: adaptive });
  const documents = workerDiscoverDocumentRepository(input.documents);
  const storage = workerDiscoverDocumentStorage(input.documents, input.userId, input.caseId);

  const adaptiveDeps = adaptive
    ? {
        resolutionEngine: createDiscoverResolutionEngineFromEnv(input.env).engine,
        resolutionPrompt: loadDiscoverResolutionPrompt(),
        questionRepo: new WorkerDiscoverQuestionRepository(input.gateway, input.userId),
        answerRepo: new WorkerDiscoverCustomerAnswerRepository(input.gateway, input.userId),
        caseCustomerContextRepo: new WorkerCaseCustomerContextRepository(
          input.gateway,
          input.userId,
        ),
      }
    : undefined;

  return {
    promptVersion,
    deps: {
      sessionUserId: input.userId,
      engineConfig,
      prompt,
      documents,
      storage,
      runRepo: new WorkerDiscoverRunRepository(input.gateway, input.userId),
      artifactRepo: new WorkerDiscoverArtifactRepository(input.gateway, input.userId),
      adaptive: adaptiveDeps,
    },
  };
}
