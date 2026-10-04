import { describe, expect, it } from "vitest";

import { buildCanonicalCaseSnapshot, InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import { resolveDomainPackFromDiscoveryLabel } from "@hiveforyou/domain-packs";
import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  type CanonicalStudyProposal,
} from "@hiveforyou/shared/case-intelligence/3";

import {
  createCanonicalStudyEngineFromEnv,
  FixtureCanonicalStudyEngine,
} from "../study/engine";
import { InMemoryStudyRunEventRepository } from "../study/event-repository";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
} from "../study/repositories";
import { runCanonicalStudy, type StudyServiceDeps } from "../study/run-canonical-study";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import { createDomainLearningCandidate } from "./learning-candidate";
import { createInMemoryDomainLearningPort } from "./index";
import { mapEvidenceSourceClass, recordPostValidationLearning } from "./record-post-validation-learning";
import { freezeCanonicalStudyContext } from "../study/freeze-context";
import { validateCanonicalStudyProposalV3 } from "../study/validate-proposal-v3";
import { InMemoryCaseQuestionAnswerRepository } from "./repositories";

const USER = "user-learning-test";

function baseRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "case-learning-1",
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-staged-1",
        originalFilename: "iep_2024.pdf",
        sizeBytes: 100,
        storageBucket: "case-documents",
        storagePath: "user/case/staged-1/iep_2024.pdf",
        sha256: "abc",
        sourceDocumentId: "staged-1",
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
      missingDocuments: [
        {
          id: "missing-progress",
          expectedDocumentType: "progress_report",
          familyRole: "supporting",
          groupId: "planning",
          reasonExpected: "sequence_gap",
        },
      ],
    },
    questionSet: {
      id: "qs-1",
      questions: [
        {
          id: "q1",
          prompt: "Do you have the progress report from last year?",
          required: true,
          answerKind: "missing_document_disposition",
          affectsCanonicalTruth: true,
          affectsAnalysis: true,
          affectsProjection: true,
          questionKey: "missing_expected_document",
          wordingVersion: "v1",
          triggerType: "MISSING_EXPECTED_DOCUMENT",
          triggerKey: "missing-progress",
        },
        {
          id: "q2",
          prompt: "Updated wording for the same semantic question?",
          required: true,
          answerKind: "missing_document_disposition",
          affectsCanonicalTruth: true,
          affectsAnalysis: true,
          affectsProjection: true,
          questionKey: "missing_expected_document",
          wordingVersion: "v2",
          triggerType: "MISSING_EXPECTED_DOCUMENT",
          triggerKey: "missing-progress",
        },
        {
          id: "q-intent",
          prompt: "What are you trying to understand?",
          required: false,
          answerKind: "multi_select",
          affectsCanonicalTruth: false,
          affectsAnalysis: true,
          affectsProjection: true,
          questionKey: "analysis_intent",
          triggerType: "ANALYSIS_INTENT",
        },
        {
          id: "q-context",
          prompt: "Anything else?",
          required: false,
          answerKind: "free_text",
          affectsCanonicalTruth: false,
          affectsAnalysis: true,
          affectsProjection: true,
          questionKey: "optional_user_context",
        },
      ],
    },
    answerSnapshot: {
      questionSetId: "qs-1",
      answers: {
        q1: {
          questionId: "q1",
          value: { disposition: "unavailable" },
          status: "answered",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        q2: {
          questionId: "q2",
          value: { disposition: "not_applicable" },
          status: "answered",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        "q-intent": {
          questionId: "q-intent",
          value: { choiceIds: ["improving"] },
          status: "answered",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        "q-context": {
          questionId: "q-context",
          value: { text: "Sensitive narrative about a student." },
          status: "answered",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      },
      missingNodeStates: { "missing-progress": "UNAVAILABLE" },
      ambiguityNodeStates: {},
      analysisIntent: { choiceIds: ["improving"] },
      userContext: { text: "Sensitive narrative about a student." },
    },
    answerSnapshotId: "snap-1",
  };
}

function createDeps(domainLearning = createInMemoryDomainLearningPort()): StudyServiceDeps {
  return {
    engine: new FixtureCanonicalStudyEngine(),
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
    prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
    inFlight: new Map(),
    sessionUserId: USER,
    domainLearning,
  };
}

describe("domain learning foundation", () => {
  it("persists questions, triggers, versioned answers, study bindings, and documents", async () => {
    const domainLearning = createInMemoryDomainLearningPort();
    const outcome = await runCanonicalStudy(baseRequest(), createDeps(domainLearning));
    expect(outcome.run.status).toBe("SUCCEEDED");

    const questions = await domainLearning.caseQuestions.listByCase("case-learning-1");
    expect(questions.length).toBe(4);
    expect(questions.filter((q) => q.questionKey === "missing_expected_document").length).toBe(2);
    expect(
      new Set(
        questions
          .filter((q) => q.questionKey === "missing_expected_document")
          .map((q) => q.questionText),
      ).size,
    ).toBe(2);
    expect(questions[0]?.triggerType).toBe("MISSING_EXPECTED_DOCUMENT");

    const bindings = await domainLearning.studyRunAnswers.listByStudyRun(outcome.run.studyRunId);
    expect(bindings.length).toBe(4);

    const docs = await domainLearning.studyRunDocuments.listByStudyRun(outcome.run.studyRunId);
    expect(docs.length).toBe(1);
    expect(docs[0]?.includedInStudy).toBe(true);
  });

  it("creates a new answer version instead of updating", async () => {
    const domainLearning = createInMemoryDomainLearningPort();
    const deps = createDeps(domainLearning);
    const request = baseRequest();
    await runCanonicalStudy(request, deps);

    const question = (await domainLearning.caseQuestions.listByCase("case-learning-1"))[0]!;
    const versions = await domainLearning.caseAnswers.listByQuestion(question.id);
    expect(versions.length).toBe(1);

    request.answerSnapshot.answers.q1 = {
      questionId: "q1",
      value: { disposition: "not_applicable" },
      status: "answered",
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    await runCanonicalStudy(request, deps);
    const nextVersions = await domainLearning.caseAnswers.listByQuestion(question.id);
    expect(nextVersions.length).toBe(2);
    expect(nextVersions[1]?.supersedesAnswerId).toBe(nextVersions[0]?.id);
  });

  it("stores opaque logical document ids on document evidence lineage", async () => {
    const domainLearning = createInMemoryDomainLearningPort();
    const pack = resolveDomainPackFromDiscoveryLabel("Special education records")!;
    const stagedId = "44444444-4444-4444-8444-444444444444";
    const discoveryDocId = "doc-referral";
    const context = freezeCanonicalStudyContext({
      request: {
        ...baseRequest(),
        sourceDocuments: [
          {
            stagedDocumentId: stagedId,
            discoveryDocumentId: discoveryDocId,
            sourceDocumentId: stagedId,
            originalFilename: "referral.pdf",
            sizeBytes: 100,
          },
        ],
        engine1Result: {
          ...baseRequest().engine1Result,
          documents: [
            {
              id: discoveryDocId,
              stagedDocumentId: stagedId,
              documentType: "Referral",
              title: "Referral",
              originalFilename: "referral.pdf",
              sizeBytes: 100,
              familyRole: "evaluation",
              groupId: "evaluations",
              recognitionStatus: "recognized",
            },
          ],
        },
      },
      studyRunId: "run-logical-lineage",
      resolvedPack: pack,
      idempotencyKey: "idem-logical",
      providerId: "fixture",
      providerMode: "fixture",
    });
    context.logicalDocuments = [
      {
        id: "ld-referral",
        domainId: "iep",
        sourceDocumentId: stagedId,
        pageStart: 1,
        pageEnd: 2,
        documentType: "Referral",
        title: "Referral",
        familyRole: "evaluation",
        groupId: "evaluations",
        recognitionStatus: "recognized",
        provenance: "UPLOADED_EVIDENCE",
      },
    ];
    const proposal: CanonicalStudyProposal = {
      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
      domainId: "iep",
      entities: [
        {
          id: "e1",
          label: "Student",
          entityType: "person",
          evidenceRefs: [
            {
              id: "ev-entity",
              sourceDocumentId: stagedId,
              logicalDocumentId: "ld-referral",
              sourceType: "document",
              page: 1,
              snippet: "Student named in referral.",
            },
          ],
        },
      ],
      claims: [
        {
          id: "claim-referral",
          subjectEntityId: "e1",
          construct: "referral_on_file",
          value: { kind: "boolean", value: true },
          role: "observed",
          evidenceRefs: [
            {
              id: "ev-referral",
              sourceDocumentId: stagedId,
              logicalDocumentId: "ld-referral",
              sourceType: "document",
              page: 1,
              snippet: "Referral on file.",
            },
          ],
        },
      ],
      conflicts: [],
      missingInformation: [],
      modelMetadata: { providerId: "fixture", proposalMode: "fixture" },
      proposedAt: new Date().toISOString(),
    };
    const validation = validateCanonicalStudyProposalV3(context, proposal);
    expect(validation.status).not.toBe("FAILED");
    const snapshot = buildCanonicalCaseSnapshot(context, validation, 1);
    await recordPostValidationLearning(
      domainLearning,
      context,
      validation,
      snapshot,
      USER,
      "SUCCEEDED",
    );
    const lineage = await domainLearning.lineage.listByStudyRun(context.studyRunId);
    const documentEvidence = lineage.filter((row) => row.sourceClass === "DOCUMENT_EVIDENCE");
    expect(documentEvidence).toHaveLength(1);
    expect(documentEvidence[0]?.logicalDocumentId).toBe("ld-referral");
    expect(documentEvidence[0]?.sourceDocumentId).toBe(stagedId);
    expect(documentEvidence[0]?.metadata.logicalDocumentId).toBe("ld-referral");
  });

  it("keeps document evidence distinct from user assertions and analysis intent", async () => {
    expect(mapEvidenceSourceClass("document")).toBe("DOCUMENT_EVIDENCE");
    expect(mapEvidenceSourceClass("user_response")).toBe("USER_ASSERTION");
    expect(mapEvidenceSourceClass("user_response")).not.toBe("DOCUMENT_EVIDENCE");

    const domainLearning = createInMemoryDomainLearningPort();
    const outcome = await runCanonicalStudy(baseRequest(), createDeps(domainLearning));
    const lineage = await domainLearning.lineage.listByStudyRun(outcome.run.studyRunId);
    const documentEvidence = lineage.filter((row) => row.sourceClass === "DOCUMENT_EVIDENCE");
    const analysisIntent = lineage.filter((row) => row.sourceClass === "ANALYSIS_INTENT");

    expect(documentEvidence.length).toBeGreaterThan(0);
    expect(documentEvidence.every((row) => row.sourceDocumentId)).toBe(true);
    expect(analysisIntent.every((row) => !row.sourceDocumentId)).toBe(true);
    expect(analysisIntent.every((row) => row.answerId)).toBe(true);
    expect(lineage.some((row) => row.sourceClass === "ANALYSIS_INTENT")).toBe(true);
  });

  it("records accepted claims, rejections, missing-document observations without raw answer text", async () => {
    const domainLearning = createInMemoryDomainLearningPort();
    const outcome = await runCanonicalStudy(baseRequest(), createDeps(domainLearning));
    const observations = await domainLearning.observations.listByStudyRun(outcome.run.studyRunId);

    expect(observations.some((o) => o.observationType === "VALIDATED_CLAIM_CREATED")).toBe(true);
    expect(observations.some((o) => o.observationType === "DOCUMENT_UNAVAILABLE")).toBe(true);
    expect(observations.some((o) => o.observationType === "QUESTION_ANSWERED")).toBe(true);

    const answered = observations.filter((o) => o.observationType === "QUESTION_ANSWERED");
    for (const row of answered) {
      expect(JSON.stringify(row.observationJson)).not.toContain("Sensitive narrative");
      expect(row.observationJson.text).toBeUndefined();
    }
  });

  it("keeps observations append-only and candidates off domain packs", async () => {
    const domainLearning = createInMemoryDomainLearningPort();
    const outcome = await runCanonicalStudy(baseRequest(), createDeps(domainLearning));
    const before = (await domainLearning.observations.listByStudyRun(outcome.run.studyRunId))
      .length;

    const observation = (await domainLearning.observations.listByStudyRun(outcome.run.studyRunId))[0]!;
    const candidate = await createDomainLearningCandidate(domainLearning.candidates, {
      domainId: "iep",
      candidateType: "missing_document_pattern",
      subjectKey: "missing_expected_document",
      proposedLearning: { hint: "Often unavailable" },
      supportingObservationIds: [observation.id],
      sourceDomainPackId: "hive.domain.iep@0.0.0-scaffold",
      sourceDomainPackVersion: "0.0.0-scaffold",
    });

    expect(candidate.status).toBe("PROPOSED");
    expect(candidate.supportingObservationIds).toContain(observation.id);
    expect((await domainLearning.observations.listByStudyRun(outcome.run.studyRunId)).length).toBe(
      before,
    );
  });

  it("does not change canonical study behavior when domain learning is omitted", async () => {
    const deps = createDeps();
    delete deps.domainLearning;
    delete deps.sessionUserId;
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    expect(outcome.run.status).toBe("SUCCEEDED");
    expect(outcome.run.caseIntelligenceVersion).toBe(1);
  });

  it("fail-closes when domain learning is configured without session user", async () => {
    const deps = createDeps();
    delete deps.sessionUserId;
    const outcome = await runCanonicalStudy(baseRequest(), deps);
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("PERSISTENCE_FAILURE");
  });
});
