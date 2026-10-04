import { describe, expect, it, vi } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyProposal } from "@hiveforyou/shared/case-intelligence/3";
import { HIVE_STRUCTURE_MAP_SCHEMA, type StructureMap } from "@hiveforyou/shared/discover";

import { FixtureCanonicalStudyEngine, type CanonicalStudyEngine } from "./engine";
import { loadCanonicalStudyPrompt } from "../prompts/load-canonical-study-prompt";
import { InMemoryStudyRunEventRepository } from "./event-repository";
import {
  InMemoryStudyContextRepository,
  InMemoryStudyRunRepository,
} from "./repositories";
import { runCanonicalStudy, type StudyServiceDeps } from "./run-canonical-study";
import { validateCanonicalStudyProposalV3 } from "./validate-proposal-v3";

const DISCOVERY_RUN_ID = "D1";
const LOGICAL_DOCUMENT_COUNT = 8;

function structureMapForDiscoveryRun(discoveryRunId: string): StructureMap {
  const logicalDocuments = Array.from({ length: LOGICAL_DOCUMENT_COUNT }, (_, index) => {
    const n = index + 1;
    const sourceDocumentId = `src-${n}`;
    return {
      id: `ld-${n}`,
      domainId: "iep",
      sourceDocumentId,
      pageStart: 1,
      pageEnd: 1,
      documentType: "Individualized Education Program",
      title: `Logical document ${n}`,
      familyRole: "plan",
      groupId: "planning",
      recognitionStatus: "recognized" as const,
      provenance: "UPLOADED_EVIDENCE" as const,
    };
  });

  return {
    schemaVersion: HIVE_STRUCTURE_MAP_SCHEMA,
    discoverRunId: discoveryRunId,
    caseId: "case-provenance-binding",
    producedAt: new Date().toISOString(),
    domainResolution: {
      status: "SINGLE_DOMAIN",
      domainLabel: "Special education records",
      domainId: "iep",
      domainPackId: "hive.domain.iep",
      domainPackVersion: "0.0.0-scaffold",
    },
    domainGroups: [],
    sourceDocuments: logicalDocuments.map((doc) => ({
      sourceDocumentId: doc.sourceDocumentId,
      originalFilename: `${doc.sourceDocumentId}.pdf`,
      sizeBytes: 100,
    })),
    logicalDocuments,
    relationships: [],
    discoveryAnswers: [],
    unresolved: [],
    completeness: { status: "complete", expectations: [] },
    provenance: {
      promptVersion: "discover-v2",
      promptSha256: "test",
      providerId: "test",
    },
  };
}

function studyRequestWithDiscoveryRun(discoveryRunId?: string): StartCanonicalStudyRequest {
  const documents = Array.from({ length: LOGICAL_DOCUMENT_COUNT }, (_, index) => {
    const n = index + 1;
    const stagedDocumentId = `staged-${n}`;
    const sourceDocumentId = `src-${n}`;
    return {
      id: `doc-${n}`,
      stagedDocumentId,
      documentType: "IEP",
      title: `Doc ${n}`,
      originalFilename: `${sourceDocumentId}.pdf`,
      sizeBytes: 100,
      familyRole: "plan",
      groupId: "planning",
      recognitionStatus: "recognized" as const,
    };
  });

  return {
    caseId: "case-provenance-binding",
    discoveryRunId,
    sourceDocuments: documents.map((doc) => ({
      stagedDocumentId: doc.stagedDocumentId!,
      discoveryDocumentId: doc.id,
      sourceDocumentId: `src-${doc.stagedDocumentId!.replace("staged-", "")}`,
      originalFilename: doc.originalFilename,
      sizeBytes: doc.sizeBytes,
    })),
    engine1Result: {
      domainLabel: "Special education records",
      domainResolutionStatus: "resolved",
      groups: [],
      documents,
      relationships: [],
      missingDocuments: [],
    },
    questionSet: {
      id: "qs-provenance",
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
      questionSetId: "qs-provenance",
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
      analysisIntent: null,
      userContext: null,
    },
  };
}

function depsWithStructureMapLoader(
  engine: CanonicalStudyEngine,
  loadStructureMap: StudyServiceDeps["loadStructureMap"],
): StudyServiceDeps {
  return {
    engine,
    providerId: "fixture-canonical-study-engine",
    providerMode: "fixture",
    modelId: "fixture-v1",
    contextRepo: new InMemoryStudyContextRepository(),
    runRepo: new InMemoryStudyRunRepository(),
    eventRepo: new InMemoryStudyRunEventRepository(),
    intelligenceRepo: new InMemoryCaseIntelligenceRepository(),
    prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
    inFlight: new Map(),
    loadStructureMap,
  };
}

describe("runCanonicalStudy provenance binding", () => {
  it("binds Structure Map logical documents when discoveryRunId matches Engine 1", async () => {
    const map = structureMapForDiscoveryRun(DISCOVERY_RUN_ID);
    const inner = new FixtureCanonicalStudyEngine();
    let capturedProposal: CanonicalStudyProposal | undefined;
    const engine: CanonicalStudyEngine = {
      study: async (ctx) => {
        const proposal = await inner.study(ctx);
        capturedProposal = proposal;
        return proposal;
      },
    };
    const deps = depsWithStructureMapLoader(
      engine,
      async (id) => (id === DISCOVERY_RUN_ID ? map : null),
    );

    const outcome = await runCanonicalStudy(studyRequestWithDiscoveryRun(DISCOVERY_RUN_ID), deps);

    expect(outcome.run.status).toBe("SUCCEEDED");
    const frozen = await deps.contextRepo.getByStudyRunId(outcome.run.studyRunId);
    expect(frozen?.logicalDocuments).toHaveLength(LOGICAL_DOCUMENT_COUNT);

    expect(capturedProposal).toBeDefined();
    const validation = validateCanonicalStudyProposalV3(frozen!, capturedProposal!);
    expect(
      validation.rejected.filter((issue) => issue.code === "UNKNOWN_LOGICAL_DOCUMENT"),
    ).toHaveLength(0);
    expect(validation.accepted.claims.length).toBeGreaterThan(0);
  });

  it("fails before model invocation when discoveryRunId is missing", async () => {
    const engine = new FixtureCanonicalStudyEngine();
    const studySpy = vi.spyOn(engine, "study");
    const outcome = await runCanonicalStudy(
      studyRequestWithDiscoveryRun(undefined),
      depsWithStructureMapLoader(engine, async () => structureMapForDiscoveryRun(DISCOVERY_RUN_ID)),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("INVALID_STUDY_CONTEXT");
    expect(studySpy).not.toHaveBeenCalled();
  });

  it("fails before model invocation when Structure Map cannot be loaded", async () => {
    const engine = new FixtureCanonicalStudyEngine();
    const studySpy = vi.spyOn(engine, "study");
    const outcome = await runCanonicalStudy(
      studyRequestWithDiscoveryRun("missing-run"),
      depsWithStructureMapLoader(engine, async () => null),
    );
    expect(outcome.run.status).toBe("FAILED");
    expect(outcome.run.errorCode).toBe("INVALID_STUDY_CONTEXT");
    expect(studySpy).not.toHaveBeenCalled();
  });
});
