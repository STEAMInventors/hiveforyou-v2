import { describe, expect, it } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import { InMemoryCaseProjectionRepository } from "../persistence/case-projection-repository";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { FixtureCanonicalStudyEngineV4, type CanonicalStudyEngine } from "./engine";
import { InMemoryStudyRunEventRepository } from "./event-repository";
import { freezeCanonicalStudyContext } from "./freeze-context";
import { fingerprintAnswerSnapshot } from "./fingerprint";
import { markStudyRunWorkerFailed } from "./mark-study-run-worker-failed";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
} from "./repositories";
import type { StudyServiceDeps } from "./run-canonical-study";
import {
  fingerprintStudyArtifactContent,
  isStudyArtifactProposePlaceholder,
} from "./study-artifact-persistence";
import { InMemoryStudyArtifactRepository } from "./study-artifact-repository";
import {
  runStudyWorkerCompleteStep,
  runStudyWorkerProposeStep,
  runStudyWorkerProjectionsStep,
  runStudyWorkerValidateStep,
  type StudyWorkerEvent,
} from "./study-worker-steps";

const STUDY_RUN_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "case-test-worker-1";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: CASE_ID,
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-staged-1",
        originalFilename: "iep_2024.pdf",
        sizeBytes: 100,
      },
    ],
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents: [
        {
          id: "doc-staged-1",
          stagedDocumentId: "staged-1",
          documentType: "IEP",
          title: "IEP",
          originalFilename: "iep_2024.pdf",
          sizeBytes: 100,
          familyRole: "plan",
          groupId: "planning",
          recognitionStatus: "recognized",
        },
      ],
      relationships: [],
      missingDocuments: [],
    },
    questionSet: {
      id: "qs-1",
      questions: [
        {
          id: "q1",
          prompt: "Required?",
          required: true,
          answerKind: "single_choice",
          affectsCanonicalTruth: true,
          affectsAnalysis: true,
          affectsProjection: true,
        },
      ],
    },
    answerSnapshot: {
      questionSetId: "qs-1",
      answers: {
        q1: {
          questionId: "q1",
          value: { choiceId: "a" },
          status: "answered",
          updatedAt: new Date().toISOString(),
        },
      },
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: { choiceIds: ["improving"] },
      userContext: null,
    },
  };
}

async function seedWorkerStudyDeps(engine: CanonicalStudyEngine): Promise<{
  deps: StudyServiceDeps;
  event: StudyWorkerEvent;
  request: StartCanonicalStudyRequest;
}> {
  const prompt = loadCanonicalStudyPrompt("canonical-study-v4");
  const resolvedPack = resolveDomainPackFromDiscoveryLabel("Special education records");
  if (!resolvedPack) {
    throw new Error("MISSING_PACK");
  }
  const request = baseRequest();
  const context = freezeCanonicalStudyContext({
    request,
    studyRunId: STUDY_RUN_ID,
    resolvedPack,
    idempotencyKey: "idem-worker-test",
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    prompt,
  });

  const runRepo = new InMemoryStudyRunRepository();
  const contextRepo = new InMemoryStudyContextRepository();
  const artifactRepo = new InMemoryStudyArtifactRepository();
  const projectionRepo = new InMemoryCaseProjectionRepository();
  const intelligenceRepo = new InMemoryCaseIntelligenceRepository();
  const eventRepo = new InMemoryStudyRunEventRepository();

  await runRepo.save({
    studyRunId: STUDY_RUN_ID,
    caseId: CASE_ID,
    idempotencyKey: "idem-worker-test",
    studyContextId: STUDY_RUN_ID,
    domainId: resolvedPack.domainId,
    domainPackId: resolvedPack.domainPackId,
    domainPackVersion: resolvedPack.domainPackVersion,
    questionSetVersion: request.questionSet.id,
    answerSnapshotHash: fingerprintAnswerSnapshot(request),
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    promptId: prompt.id,
    promptVersion: prompt.version,
    promptSha256: prompt.sha256,
    startedAt: new Date().toISOString(),
    status: "RUNNING",
  });
  await contextRepo.save(context);

  const deps: StudyServiceDeps = {
    engine,
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    modelId: "fixture-v1",
    prompt,
    contextRepo,
    runRepo,
    eventRepo,
    intelligenceRepo,
    projectionRepo,
    studyArtifactRepo: artifactRepo,
    sessionUserId: USER_ID,
  };

  const event: StudyWorkerEvent = {
    userId: USER_ID,
    caseId: CASE_ID,
    intakeRunId: "intake-1",
    studyRunId: STUDY_RUN_ID,
  };

  return { deps, event, request };
}

describe("study worker steps (fixture engine)", () => {
  it("propose → validate → validate retry leaves one artifact and SUCCEEDED run", async () => {
    const { deps, event, request } = await seedWorkerStudyDeps(new FixtureCanonicalStudyEngineV4());

    await runStudyWorkerProposeStep(deps, event, request);
    let artifact = await deps.studyArtifactRepo!.getByStudyRunId(STUDY_RUN_ID);
    expect(artifact).toBeTruthy();
    expect(
      isStudyArtifactProposePlaceholder(
        artifact!.validationResultJson as CanonicalStudyValidationResultV3,
      ),
    ).toBe(true);

    await runStudyWorkerValidateStep(deps, event);
    artifact = await deps.studyArtifactRepo!.getByStudyRunId(STUDY_RUN_ID);
    expect(
      (artifact!.validationResultJson as CanonicalStudyValidationResultV3).status,
    ).not.toBe("FAILED");

    const fpBefore = fingerprintStudyArtifactContent({
      rawProposalJson: artifact!.rawProposalJson,
      validationResultJson: artifact!.validationResultJson as CanonicalStudyValidationResultV3,
    });
    await runStudyWorkerValidateStep(deps, event);
    artifact = await deps.studyArtifactRepo!.getByStudyRunId(STUDY_RUN_ID);
    const fpAfter = fingerprintStudyArtifactContent({
      rawProposalJson: artifact!.rawProposalJson,
      validationResultJson: artifact!.validationResultJson as CanonicalStudyValidationResultV3,
    });
    expect(fpAfter).toBe(fpBefore);

    await runStudyWorkerProjectionsStep(deps, event);
    const completed = await runStudyWorkerCompleteStep(deps, event);
    expect(completed.status).toBe("SUCCEEDED");

    const run = await deps.runRepo.getByStudyRunId(STUDY_RUN_ID);
    expect(run?.status).toBe("SUCCEEDED");
  });

  it("markStudyRunWorkerFailed surfaces FAILED for spinning UI", async () => {
    const { deps, event } = await seedWorkerStudyDeps(new FixtureCanonicalStudyEngineV4());
    await markStudyRunWorkerFailed(deps.runRepo, deps.eventRepo, {
      userId: USER_ID,
      studyRunId: event.studyRunId,
      errorCode: "STUDY_WORKER_FAILED",
    });
    const run = await deps.runRepo.getByStudyRunId(STUDY_RUN_ID);
    expect(run?.status).toBe("FAILED");
  });
});
