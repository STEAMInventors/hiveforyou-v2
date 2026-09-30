import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BANKRUPTCY_DISCOVER_PACK,
  IEP_DISCOVER_PACK,
} from "@hiveforyou/domain-packs";
import type {
  CustomerDiscoveryAnswer,
  HiveDiscoverProposalV2,
  ProposedLogicalDocument,
} from "@hiveforyou/shared/discover";
import { HIVE_DISCOVER_PROPOSAL_SCHEMA_V2, isDiscoverProposalV2 } from "@hiveforyou/shared/discover";

import {
  InMemorySourceDocumentRepository,
  type SourceDocumentRecord,
} from "../persistence/source-document-repository";
import { InMemorySourceDocumentStorage } from "../persistence/source-document-storage";
import { buildSourceDocumentStoragePath } from "../persistence/storage-path";
import { InMemoryCaseCustomerContextRepository } from "../persistence/case-customer-context-repository";
import { loadDiscoverPrompt } from "../prompts/load-discover-prompt";
import { loadDiscoverResolutionPrompt } from "../prompts/load-discover-resolution-prompt";
import * as packCompleteness from "./check-pack-completeness";
import type { DiscoverEngine } from "./engine";
import { createDiscoverResolutionEngineFromEnv } from "./engine";
import { isObjectiveQuestion } from "./objective-question";
import {
  InMemoryDiscoverArtifactRepository,
  InMemoryDiscoverRunRepository,
} from "./repositories";
import {
  InMemoryDiscoverCustomerAnswerRepository,
  InMemoryDiscoverQuestionRepository,
} from "./repositories-adaptive";
import { runDiscover } from "./run-discover";
import type { DiscoverEngineContext } from "./engine";

const completenessSpy = vi.spyOn(packCompleteness, "checkPackCompleteness");

beforeEach(() => {
  completenessSpy.mockClear();
});

function sourceRecord(id: string): SourceDocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    userId: "user-1",
    caseId: "case-1",
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: id,
    originalFilename: `${id}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageBucket: "case-documents",
    storagePath: buildSourceDocumentStoragePath({
      userId: "user-1",
      caseId: "case-1",
      sourceDocumentId: id,
      originalFilename: `${id}.pdf`,
    }),
    sha256: "abc",
    status: "stored",
    createdAt: now,
    updatedAt: now,
  };
}

function logicalDocument(input: {
  id: string;
  sourceDocumentId: string;
  domainId: string;
  documentType: string;
  familyRole: string;
  groupId: string;
  title: string;
}): ProposedLogicalDocument {
  return {
    id: input.id,
    domainId: input.domainId,
    sourceDocumentId: input.sourceDocumentId,
    pageStart: 1,
    documentType: input.documentType,
    title: input.title,
    familyRole: input.familyRole,
    groupId: input.groupId,
    recognitionStatus: "recognized",
    sequenceOrder: 1,
  };
}

type DomainGroupDraft = Omit<
  HiveDiscoverProposalV2["domainGroups"][number],
  "suggestedObjectives" | "suggestedAudiences"
> &
  Partial<
    Pick<
      HiveDiscoverProposalV2["domainGroups"][number],
      "suggestedObjectives" | "suggestedAudiences"
    >
  >;

function proposal(input: {
  status: HiveDiscoverProposalV2["domainResolution"]["status"];
  domainLabel: string;
  domainGroups: DomainGroupDraft[];
  logicalDocuments: ProposedLogicalDocument[];
}): HiveDiscoverProposalV2 {
  return {
    schemaVersion: HIVE_DISCOVER_PROPOSAL_SCHEMA_V2,
    domainResolution: {
      status: input.status,
      domainLabel: input.domainLabel,
      ...(input.status === "MULTI_DOMAIN"
        ? {
            candidateDomainLabels: [
              ...new Set(input.domainGroups.map((group) => group.domainLabel)),
            ],
          }
        : {}),
    },
    domainGroups: input.domainGroups.map((group) => ({
      ...group,
      suggestedObjectives: group.suggestedObjectives ?? [
        { id: "o1", label: "Understand the records", summary: "Read what was uploaded" },
        { id: "o2", label: "Prepare for a meeting", summary: "Focus on the next meeting" },
        { id: "o3", label: "Track timelines", summary: "See the sequence" },
      ],
      suggestedAudiences: group.suggestedAudiences ?? [
        { id: "a1", label: "Just for me", roleHint: "self" },
      ],
    })),
    logicalDocuments: input.logicalDocuments,
    relationships: [],
    ambiguityCandidates: [],
    clarificationQuestions: [],
  };
}

function scriptedEngine(value: HiveDiscoverProposalV2): DiscoverEngine {
  return {
    async discover(_context: DiscoverEngineContext) {
      return value;
    },
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

async function runCollection(sourceIds: string[], engineProposal: HiveDiscoverProposalV2) {
  const prompt = loadDiscoverPrompt("discover-v2");
  const { documents, storage } = await seedSources(sourceIds);
  const deps = {
    sessionUserId: "user-1",
    engineConfig: {
      engine: scriptedEngine(engineProposal),
      mode: "fixture" as const,
      providerId: "fixture",
    },
    prompt,
    documents,
    storage,
    runRepo: new InMemoryDiscoverRunRepository(),
    artifactRepo: new InMemoryDiscoverArtifactRepository(),
    adaptive: {
      resolutionEngine: createDiscoverResolutionEngineFromEnv({ engine: "fixture" }).engine,
      resolutionPrompt: loadDiscoverResolutionPrompt(),
      questionRepo: new InMemoryDiscoverQuestionRepository(),
      answerRepo: new InMemoryDiscoverCustomerAnswerRepository(),
      caseCustomerContextRepo: new InMemoryCaseCustomerContextRepository(),
    },
  };
  const start = await runDiscover({ caseId: "case-1", sourceDocumentIds: sourceIds }, deps);
  return { start, deps, sourceIds };
}

function objectiveAnswer(questionId: string, discoverRunId: string): CustomerDiscoveryAnswer {
  return {
    questionId,
    evidenceKind: "CUSTOMER_ASSERTION",
    answer: { choiceId: "o1", text: "Understand the records" },
    answeredAt: new Date().toISOString(),
    userId: "user-1",
    discoverRunId,
    caseId: "case-1",
  };
}

describe("domain group semantics", () => {
  it("collapses IEP evaluations and planning into one domain and one pack completeness pass", async () => {
    const evalIds = ["e1", "e2", "e3", "e4", "e5", "e6", "e7"];
    const sourceIds = [...evalIds, "p1"];
    const logicalDocuments = [
      ...evalIds.map((id) =>
        logicalDocument({
          id: `doc-${id}`,
          sourceDocumentId: id,
          domainId: "iep",
          documentType: "Psychoeducational evaluation",
          familyRole: "Evaluation report",
          groupId: "evaluations",
          title: `Evaluation ${id}`,
        }),
      ),
      logicalDocument({
        id: "doc-p1",
        sourceDocumentId: "p1",
        domainId: "iep",
        documentType: "Individualized Education Program",
        familyRole: "Service plan",
        groupId: "planning",
        title: "IEP",
      }),
    ];
    const allLogicalIds = [...evalIds.map((id) => `doc-${id}`), "doc-p1"];
    const engineProposal = proposal({
      status: "SINGLE_DOMAIN",
      domainLabel: IEP_DISCOVER_PACK.domainLabel,
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: allLogicalIds,
          description: "Special education records",
        },
      ],
      logicalDocuments,
    });

    const { start, deps, sourceIds: ids } = await runCollection(sourceIds, engineProposal);

    expect(start.run.status).toBe("NEEDS_OBJECTIVE_INPUT");
    expect(isDiscoverProposalV2(start.rawProposal) && start.rawProposal.domainGroups).toHaveLength(1);
    expect(start.collectionUnderstanding?.domainGroups).toHaveLength(1);
    const domainGroup = start.collectionUnderstanding!.domainGroups[0]!;
    expect(domainGroup.domainId).toBe("iep");
    expect(domainGroup.logicalDocumentIds).toHaveLength(8);
    expect(domainGroup.documentCategories?.map((category) => category.logicalDocumentIds.length)).toEqual([
      7, 1,
    ]);
    expect(start.discoveryQuestions?.filter(isObjectiveQuestion)).toHaveLength(1);
    expect(completenessSpy).not.toHaveBeenCalled();

    const objectiveQuestion = start.discoveryQuestions!.find(isObjectiveQuestion)!;
    const afterObjective = await runDiscover(
      {
        caseId: "case-1",
        sourceDocumentIds: ids,
        discoverRunId: start.run.discoverRunId,
        customerAnswers: [objectiveAnswer(objectiveQuestion.id, start.run.discoverRunId)],
        caseCustomerContextIntake: {
          domains: [
            {
              domainId: "iep",
              objective: "Understand the records",
              shareIntent: "no",
            },
          ],
        },
      },
      deps,
    );

    expect(afterObjective.structureMap?.domainGroups).toHaveLength(1);
    expect(afterObjective.structureMap?.domainGroups?.[0]?.logicalDocumentIds).toHaveLength(8);
    expect(afterObjective.structureMap?.domainGroups?.[0]?.documentCategories).toEqual([
      expect.objectContaining({ id: "evaluations", logicalDocumentIds: evalIds.map((id) => `doc-${id}`) }),
      expect.objectContaining({ id: "planning", logicalDocumentIds: ["doc-p1"] }),
    ]);
    expect(completenessSpy).toHaveBeenCalledTimes(1);
    expect(completenessSpy.mock.calls[0]?.[0].pack.domainId).toBe("iep");
    expect(completenessSpy.mock.calls[0]?.[0].logicalDocuments).toHaveLength(8);

    const expectationIds =
      afterObjective.structureMap?.completeness.expectations.map((item) => item.packExpectationId) ??
      [];
    expect(expectationIds.filter((id) => id === "iep-expect-pwn")).toHaveLength(1);
    expect(expectationIds.filter((id) => id === "iep-expect-progress-prior-year")).toHaveLength(1);
    expect(new Set(expectationIds).size).toBe(expectationIds.length);

    const missingTypes =
      afterObjective.documentDiscovery?.missingDocuments.map((item) => item.expectedDocumentType) ?? [];
    expect(missingTypes.filter((type) => type === "Prior Written Notice")).toHaveLength(1);
    expect(
      missingTypes.filter((type) => type === "Annual progress report (prior school year)"),
    ).toHaveLength(1);
    expect(afterObjective.documentDiscovery?.domainSections).toHaveLength(1);
    expect(afterObjective.documentDiscovery?.domainSections?.[0]?.documents).toHaveLength(8);
    expect(afterObjective.documentDiscovery?.documents).toHaveLength(8);
  });

  it("keeps IEP and bankruptcy as two domains and confirms only those domains", async () => {
    const logicalDocuments = [
      logicalDocument({
        id: "doc-e1",
        sourceDocumentId: "e1",
        domainId: "iep",
        documentType: "Psychoeducational evaluation",
        familyRole: "Evaluation report",
        groupId: "evaluations",
        title: "Evaluation",
      }),
      logicalDocument({
        id: "doc-p1",
        sourceDocumentId: "p1",
        domainId: "iep",
        documentType: "Individualized Education Program",
        familyRole: "Service plan",
        groupId: "planning",
        title: "IEP",
      }),
      logicalDocument({
        id: "doc-b1",
        sourceDocumentId: "b1",
        domainId: "bankruptcy",
        documentType: "Petition",
        familyRole: "Court filing",
        groupId: "uploads",
        title: "Petition",
      }),
    ];
    const engineProposal = proposal({
      status: "MULTI_DOMAIN",
      domainLabel: "Multiple domains",
      domainGroups: [
        {
          id: "iep",
          domainId: "iep",
          domainLabel: IEP_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-e1", "doc-p1"],
          description: "Special education records",
        },
        {
          id: "bankruptcy",
          domainId: "bankruptcy",
          domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-b1"],
          description: "Bankruptcy filings",
        },
      ],
      logicalDocuments,
    });

    const { start, deps, sourceIds } = await runCollection(["e1", "p1", "b1"], engineProposal);

    expect(start.collectionUnderstanding?.domainGroups).toHaveLength(2);
    expect(start.collectionUnderstanding?.domainGroups.map((group) => group.domainId)).toEqual([
      "iep",
      "bankruptcy",
    ]);
    expect(start.collectionUnderstanding?.domainGroups[0]?.logicalDocumentIds).toHaveLength(2);
    expect(start.collectionUnderstanding?.domainGroups[0]?.documentCategories).toHaveLength(2);
    const objectiveQuestions = start.discoveryQuestions!.filter(isObjectiveQuestion);
    expect(objectiveQuestions.map((question) => question.questionKey).sort()).toEqual([
      "discovery.objective.bankruptcy",
      "discovery.objective.iep",
    ]);
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

    expect(afterObjective.structureMap?.domainGroups?.map((group) => group.domainId)).toEqual([
      "iep",
      "bankruptcy",
    ]);
    expect(completenessSpy).toHaveBeenCalledTimes(2);
    const calledPacks = completenessSpy.mock.calls.map((call) => call[0].pack.domainId).sort();
    expect(calledPacks).toEqual(["bankruptcy", "iep"]);
    const callsByDomain = new Map(
      completenessSpy.mock.calls.map((call) => [call[0].pack.domainId, call[0].logicalDocuments.length]),
    );
    expect(callsByDomain.get("iep")).toBe(2);
    expect(callsByDomain.get("bankruptcy")).toBe(1);

    const expectationIds =
      afterObjective.structureMap?.completeness.expectations.map((item) => item.packExpectationId) ??
      [];
    expect(expectationIds.filter((id) => id === "iep-expect-pwn")).toHaveLength(1);
    expect(expectationIds.filter((id) => id === "iep-expect-progress-prior-year")).toHaveLength(1);
  });

  it("keeps proposed_type labels when the pack lacks the document type", async () => {
    const engineProposal = proposal({
      status: "SINGLE_DOMAIN",
      domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
      domainGroups: [
        {
          id: "bankruptcy",
          domainId: "bankruptcy",
          domainLabel: BANKRUPTCY_DISCOVER_PACK.domainLabel,
          logicalDocumentIds: ["doc-b1"],
          description: "Bankruptcy records",
        },
      ],
      logicalDocuments: [
        logicalDocument({
          id: "doc-b1",
          sourceDocumentId: "b1",
          domainId: "bankruptcy",
          documentType: "Creditor matrix supplement",
          familyRole: "Supporting schedule",
          groupId: "uploads",
          title: "Matrix supplement",
        }),
      ],
    });
    engineProposal.logicalDocuments[0]!.recognitionStatus = "proposed_type";

    const { start } = await runCollection(["b1"], engineProposal);
    expect(start.run.status).toBe("NEEDS_OBJECTIVE_INPUT");
    expect(start.rawProposal?.logicalDocuments[0]?.documentType).toBe("Creditor matrix supplement");
    expect(start.rawProposal?.logicalDocuments[0]?.recognitionStatus).toBe("proposed_type");
  });
});
