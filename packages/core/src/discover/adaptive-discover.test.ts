import { describe, expect, it } from "vitest";

import { requireDiscoverPack } from "@hiveforyou/domain-packs";

const BANKRUPTCY_DISCOVER_PACK = requireDiscoverPack("bankruptcy");
const IEP_DISCOVER_PACK = requireDiscoverPack("iep");
const MEDICAID_DISCOVER_PACK = requireDiscoverPack("medicaid");
import type { CustomerDiscoveryAnswer } from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2 } from "@hiveforyou/shared/discover";

import {
  InMemorySourceDocumentRepository,
  type SourceDocumentRecord,
} from "../persistence/source-document-repository";
import { InMemorySourceDocumentStorage } from "../persistence/source-document-storage";
import { buildSourceDocumentStoragePath } from "../persistence/storage-path";
import { loadDiscoverPrompt } from "../prompts/load-discover-prompt";
import { loadDiscoverResolutionPrompt } from "../prompts/load-discover-resolution-prompt";
import {
  DISCOVERY_OBJECTIVE_QUESTION_KEY,
  isObjectiveQuestion,
} from "./objective-question";
import {
  createDiscoverEngineFromEnv,
  createDiscoverResolutionEngineFromEnv,
} from "./engine";
import {
  InMemoryDiscoverArtifactRepository,
  InMemoryDiscoverRunRepository,
} from "./repositories";
import { InMemoryCaseCustomerContextRepository } from "../persistence/case-customer-context-repository";
import {
  InMemoryDiscoverCustomerAnswerRepository,
  InMemoryDiscoverQuestionRepository,
} from "./repositories-adaptive";
import { runDiscover } from "./run-discover";
import { validateDiscoveryProposalV2 } from "./validate-discovery-proposal-v2";

function sourceRecord(id: string): SourceDocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    userId: "user-1",
    caseId: "case-1",
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: id,
    originalFilename: "upload.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageBucket: "case-documents",
    storagePath: buildSourceDocumentStoragePath({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: id,
      originalFilename: "upload.pdf",
    }),
    sha256: "abc",
    status: "stored",
    createdAt: now,
    updatedAt: now,
  };
}

function adaptiveDeps(caseCustomerContextRepo = new InMemoryCaseCustomerContextRepository()) {
  return {
    resolutionEngine: createDiscoverResolutionEngineFromEnv({ engine: "fixture" }).engine,
    resolutionPrompt: loadDiscoverResolutionPrompt(),
    questionRepo: new InMemoryDiscoverQuestionRepository(),
    answerRepo: new InMemoryDiscoverCustomerAnswerRepository(),
    caseCustomerContextRepo,
  };
}

async function seedSources(ids: string[]) {
  const documents = new InMemorySourceDocumentRepository();
  const storage = new InMemorySourceDocumentStorage("user-1");
  for (const id of ids) {
    const record = sourceRecord(id);
    await documents.insert(record);
    await storage.upload({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: record.id,
      originalFilename: record.originalFilename,
      bytes: new Uint8Array([1]),
      bucket: "case-documents",
    });
  }
  return { documents, storage };
}

function objectiveAnswer(questionId: string, discoverRunId: string, text?: string): CustomerDiscoveryAnswer {
  return {
    questionId,
    evidenceKind: "CUSTOMER_ASSERTION",
    answer: text
      ? { text }
      : { choiceId: "obj-understand", text: "Understand what these documents say" },
    answeredAt: new Date().toISOString(),
    userId: "user-1",
    discoverRunId,
    caseId: "case-1",
  };
}

async function runAdaptiveDiscoverFlow(sourceIds: string[]) {
  const prompt = loadDiscoverPrompt("discover-v2");
  const { documents, storage } = await seedSources(sourceIds);
  const runRepo = new InMemoryDiscoverRunRepository();
  const artifactRepo = new InMemoryDiscoverArtifactRepository();
  const adaptive = adaptiveDeps();
  const deps = {
    sessionUserId: "user-1",
    engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }, { adaptiveV2: true }),
    prompt,
    documents,
    storage,
    runRepo,
    artifactRepo,
    adaptive,
  };
  const start = await runDiscover({ caseId: "case-1", sourceDocumentIds: sourceIds }, deps);
  return { start, deps, sourceIds };
}

describe("Adaptive Engine 1 V2", () => {
  it("rejects legacy missingExpectedDocuments on v2 proposals", () => {
    const validation = validateDiscoveryProposalV2(
      {
        schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
        domainResolution: {
          status: "SINGLE_DOMAIN",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          candidateDomainLabels: null,
        },
        domainGroups: [
          {
            id: "iep",
            domainId: "iep",
            domainLabel: IEP_DISCOVER_PACK.domainLabel,
            logicalDocumentIds: ["doc-1"],
            description: "Special education records",
            suggestedObjectives: [
              { id: "o1", label: "A", summary: "a" },
              { id: "o2", label: "B", summary: "b" },
              { id: "o3", label: "C", summary: "c" },
            ],
            suggestedAudiences: [{ id: "a1", label: "Just for me", roleHint: "self" }],
          },
        ],
        logicalDocuments: [
          {
            id: "doc-1",
            domainId: "iep",
            sourceDocumentId: "src-1",
            pageStart: 1,
            pageEnd: null,
            documentType: "Individualized Education Program",
            title: "IEP",
            documentDate: null,
            familyRole: "Service plan",
            groupId: "planning",
            recognitionStatus: "recognized",
            sequenceOrder: null,
          },
        ],
        relationships: [],
        missingExpectedDocuments: [{ id: "missing-1" }],
        ambiguityCandidates: [],
        clarificationQuestions: [],
      },
      [{ sourceDocumentId: "src-1", originalFilename: "x.pdf", sizeBytes: 1 }],
    );
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.path === "missingExpectedDocuments")).toBe(true);
  });

  it("runs collection Call #1 then gates on intelligent objective confirmation", async () => {
    const { start } = await runAdaptiveDiscoverFlow(["src-1", "src-2"]);
    expect(start.run.status).toBe("NEEDS_OBJECTIVE_INPUT");
    expect(start.collectionUnderstanding?.domainGroups[0]?.suggestedObjectives.length).toBeGreaterThanOrEqual(3);
    expect(start.discoveryQuestions?.[0]?.questionKey.startsWith(`${DISCOVERY_OBJECTIVE_QUESTION_KEY}.`)).toBe(true);
    expect(start.discoveryQuestions?.[0]?.options.length).toBeGreaterThan(1);
    expect(start.rawProposal?.clarificationQuestions).toEqual([]);
  });

  it("continues after objective when intake uses model-suggested audience ids", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow(["src-only"]);
    const objectiveQuestion = start.discoveryQuestions![0]!;
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: sourceIds,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, start.run.discoverRunId)],
        caseCustomerContextIntake: {
          domains: [
            {
              domainId: "iep",
              objective: "Understand my child's IEP services and timelines.",
              shareIntent: "yes",
              intendedAudienceRoleId: "aud-advisor",
            },
          ],
        },
      },
      deps,
    );
    expect(afterObjective.run.status).not.toBe("NEEDS_OBJECTIVE_INPUT");
    expect(afterObjective.run.status).not.toBe("FAILED");
  });

  it("persists case customer context after objective confirmation", async () => {
    const contextRepo = new InMemoryCaseCustomerContextRepository();
    const prompt = loadDiscoverPrompt("discover-v2");
    const { documents, storage } = await seedSources(["src-only"]);
    const adaptive = adaptiveDeps(contextRepo);
    const runRepo = new InMemoryDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();
    const deps = {
      sessionUserId: "user-1",
      engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }, { adaptiveV2: true }),
      prompt,
      documents,
      storage,
      runRepo,
      artifactRepo,
      adaptive,
    };
    const gated = await runDiscover({ caseId: "case-1", sourceDocumentIds: ["src-only"] }, deps);
    const objectiveQuestion = gated.discoveryQuestions![0]!;
    await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: ["src-only"],
        discoverRunId: gated.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, gated.run.discoverRunId)],
        caseCustomerContextIntake: {
          domains: [
            {
              domainId: "iep",
              objective: "Understand my child's IEP services and timelines.",
              shareIntent: "yes",
              intendedAudienceRoleId: "advocate",
            },
          ],
        },
      },
      deps,
    );

    const activeObjective = await contextRepo.getActiveByCaseAndType("case-1", "OBJECTIVE", "iep");
    expect((activeObjective?.valueJson as { text: string }).text).toContain("IEP services");
    const audience = await contextRepo.getActiveByCaseAndType("case-1", "INTENDED_AUDIENCE", "iep");
    expect(audience?.valueJson).toMatchObject({
      roleId: "advocate",
      domainPackId: IEP_DISCOVER_PACK.domainPackId,
    });
  });

  it("pure IEP collection does not invent pack missing-document expectations", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow(["src-only"]);
    const objectiveQuestion = start.discoveryQuestions![0]!;
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: sourceIds,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, start.run.discoverRunId)],
      },
      deps,
    );
    expect(afterObjective.run.status).toBe("READY_FOR_STUDY");
    expect(afterObjective.structureMap?.completeness.expectations ?? []).toEqual([]);
  });

  it("IEP + Bankruptcy uses one objective per domain and does not duplicate inventory rows", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow([
      "domain-iep-1",
      "domain-bankruptcy-1",
    ]);
    expect(start.collectionUnderstanding?.domainGroups).toHaveLength(2);
    const objectiveQuestions = start.discoveryQuestions!.filter(isObjectiveQuestion);
    expect(objectiveQuestions).toHaveLength(2);
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: sourceIds,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: objectiveQuestions.map((question) =>
          objectiveAnswer(question.id, start.run.discoverRunId),
        ),
        caseCustomerContextIntake: {
          domains: [
            { domainId: "iep", objective: "Prepare for an IEP meeting", shareIntent: "no" },
            { domainId: "bankruptcy", objective: "Organize bankruptcy documents", shareIntent: "no" },
          ],
        },
      },
      deps,
    );
    const sections = afterObjective.documentDiscovery?.domainSections ?? [];
    expect(sections.map((section) => section.domainId)).toEqual(["iep", "bankruptcy"]);
    const renderedIds = sections.flatMap((section) => section.documents.map((doc) => doc.id));
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    const flatGroupIds = afterObjective.documentDiscovery?.groups.map((group) => group.id) ?? [];
    expect(new Set(flatGroupIds).size).toBe(flatGroupIds.length);
    expect(flatGroupIds.filter((id) => id === "uploads")).toHaveLength(0);
    const bankruptcy = sections.find((section) => section.domainId === "bankruptcy");
    expect(bankruptcy?.groups.filter((group) => group.id === "uploads")).toHaveLength(1);
    const missingTypes = sections
      .filter((section) => section.domainId === "iep")
      .flatMap((section) => section.missingDocuments.map((item) => item.expectedDocumentType));
    expect(afterObjective.documentDiscovery?.missingDocuments ?? []).toEqual([]);
    expect(missingTypes).toEqual([]);
  });

  it("IEP + Bankruptcy + Medicaid keeps domains isolated in structure map groups", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow([
      "domain-iep-1",
      "domain-bankruptcy-1",
      "domain-medicaid-1",
    ]);
    expect(start.collectionUnderstanding?.domainGroups).toHaveLength(3);
    const objectiveQuestions = start.discoveryQuestions!.filter(isObjectiveQuestion);
    expect(objectiveQuestions).toHaveLength(3);
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: sourceIds,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: objectiveQuestions.map((question) =>
          objectiveAnswer(question.id, start.run.discoverRunId),
        ),
        caseCustomerContextIntake: {
          domains: [
            { domainId: "iep", objective: "Prepare for an IEP meeting", shareIntent: "no" },
            { domainId: "bankruptcy", objective: "Organize bankruptcy documents", shareIntent: "no" },
            { domainId: "medicaid", objective: "Review Medicaid notices", shareIntent: "no" },
          ],
        },
      },
      deps,
    );
    const groups = afterObjective.structureMap?.domainGroups ?? [];
    expect(groups.map((g) => g.domainId).sort()).toEqual(["bankruptcy", "iep", "medicaid"].sort());
    for (const group of groups) {
      const docs = afterObjective.structureMap!.logicalDocuments.filter((doc) =>
        group.logicalDocumentIds.includes(doc.id),
      );
      expect(new Set(docs.map((doc) => doc.domainId)).size).toBe(1);
    }
  });

  it("customer-edited suggested objective is persisted as CUSTOMER_ASSERTION text", async () => {
    const contextRepo = new InMemoryCaseCustomerContextRepository();
    const prompt = loadDiscoverPrompt("discover-v2");
    const { documents, storage } = await seedSources(["src-only"]);
    const adaptive = adaptiveDeps(contextRepo);
    const runRepo = new InMemoryDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();
    const deps = {
      sessionUserId: "user-1",
      engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }, { adaptiveV2: true }),
      prompt,
      documents,
      storage,
      runRepo,
      artifactRepo,
      adaptive,
    };
    const start = await runDiscover({ caseId: "case-1", sourceDocumentIds: ["src-only"] }, deps);
    const objectiveQuestion = start.discoveryQuestions![0]!;
    const custom = "My custom objective for this case.";
    await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: ["src-only"],
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [
          {
            questionId: objectiveQuestion.id,
            evidenceKind: "CUSTOMER_ASSERTION",
            answer: { choiceId: "objective.something_else", customText: custom, text: custom },
            answeredAt: new Date().toISOString(),
            userId: "user-1",
            discoverRunId: start.run.discoverRunId,
            caseId: "case-1",
          },
        ],
        caseCustomerContextIntake: {
          domains: [{ domainId: "iep", objective: custom, shareIntent: "no" }],
        },
      },
      deps,
    );
    const active = await contextRepo.getActiveByCaseAndType("case-1", "OBJECTIVE", "iep");
    expect((active?.valueJson as { text: string }).text).toBe(custom);
  });

  it("clarification questions appear only after objective confirmation", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow(["src-1", "src-2"]);
    expect(start.rawProposal?.clarificationQuestions).toEqual([]);
    const objectiveQuestion = start.discoveryQuestions![0]!;
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: sourceIds,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, start.run.discoverRunId)],
      },
      deps,
    );
    expect(afterObjective.run.status).toBe("NEEDS_DISCOVERY_INPUT");
    expect(afterObjective.discoveryQuestions?.length).toBeGreaterThanOrEqual(1);
  });

  it("stores objective for downstream Engine 2 while structure map stays evidence-only", async () => {
    const contextRepo = new InMemoryCaseCustomerContextRepository();
    const prompt = loadDiscoverPrompt("discover-v2");
    const { documents, storage } = await seedSources(["src-only"]);
    const adaptive = adaptiveDeps(contextRepo);
    const runRepo = new InMemoryDiscoverRunRepository();
    const artifactRepo = new InMemoryDiscoverArtifactRepository();
    const deps = {
      sessionUserId: "user-1",
      engineConfig: createDiscoverEngineFromEnv({ engine: "fixture" }, { adaptiveV2: true }),
      prompt,
      documents,
      storage,
      runRepo,
      artifactRepo,
      adaptive,
    };
    const start = await runDiscover({ caseId: "case-1", sourceDocumentIds: ["src-only"] }, deps);
    const objectiveQuestion = start.discoveryQuestions![0]!;
    const objectiveText = "Focus on services timeline";
    const completed = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: ["src-only"],
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, start.run.discoverRunId, objectiveText)],
        caseCustomerContextIntake: {
          domains: [
            {
              domainId: "iep",
              objective: objectiveText,
              shareIntent: "yes",
              intendedAudienceRoleId: "advocate",
            },
          ],
        },
      },
      deps,
    );
    const stored = await contextRepo.getActiveByCaseAndType("case-1", "OBJECTIVE", "iep");
    expect((stored?.valueJson as { text: string }).text).toBe(objectiveText);
    expect(
      completed.structureMap?.logicalDocuments.every((doc) => doc.provenance === "UPLOADED_EVIDENCE"),
    ).toBe(true);
    expect(completed.structureMap?.logicalDocuments.some((doc) => doc.documentType === "Advocate")).toBe(
      false,
    );
  });

  it("hydrates in-progress run on retry without duplicating provider calls", async () => {
    const { start, deps, sourceIds } = await runAdaptiveDiscoverFlow(["src-1", "src-2"]);
    const second = await runDiscover({ caseId: "case-1", sourceDocumentIds: sourceIds }, deps);
    expect(second.run.discoverRunId).toBe(start.run.discoverRunId);
    expect(second.run.status).toBe("NEEDS_OBJECTIVE_INPUT");
    expect(second.collectionUnderstanding?.domainGroups.length).toBeGreaterThan(0);
  });

  it("recognizes genuinely ambiguous fixture uploads", async () => {
    const { start } = await runAdaptiveDiscoverFlow(["domain-ambiguous-1"]);
    expect(start.collectionUnderstanding?.domainResolutionStatus).toBe("AMBIGUOUS");
    expect(start.collectionUnderstanding?.unresolvedAmbiguitySummary).toBeTruthy();
  });

  it("includes bankruptcy and medicaid labels in multi-domain fixture groups", async () => {
    const { start } = await runAdaptiveDiscoverFlow([
      "domain-bankruptcy-1",
      "domain-medicaid-1",
    ]);
    const labels = start.collectionUnderstanding!.domainGroups.map((g) => g.domainLabel);
    expect(labels).toContain(BANKRUPTCY_DISCOVER_PACK.domainLabel);
    expect(labels).toContain(MEDICAID_DISCOVER_PACK.domainLabel);
  });
});
