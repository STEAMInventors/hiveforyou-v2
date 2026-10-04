import { describe, expect, it } from "vitest";

import { InMemoryCaseIntelligenceRepository } from "@hiveforyou/canonical";
import {
  createInMemoryDomainLearningPort,
  FixtureCanonicalStudyEngine,
  InMemoryCaseProjectionRepository,
  InMemoryStudyContextRepository,
  InMemoryStudyRunEventRepository,
  InMemoryStudyRunRepository,
  loadCanonicalStudyPrompt,
  runCanonicalStudy,
  type StudyServiceDeps,
} from "@hiveforyou/core";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

import type { QuestionsAnswerSnapshot } from "@hiveforyou/shared/questions";

import type { HiveGateway, HiveRow } from "@/lib/persistence/hive-gateway";
import { SupabaseAnswerSnapshotRepository } from "@/lib/persistence/supabase-repositories";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function studyRequest(): StartCanonicalStudyRequest {
  return {
    caseId: "55555555-5555-4555-8555-555555555555",
    sourceDocuments: [
      {
        stagedDocumentId: "staged-1",
        discoveryDocumentId: "doc-staged-1",
        sourceDocumentId: "66666666-6666-4666-8666-666666666666",
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
      id: "qs-acceptance",
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
      questionSetId: "qs-acceptance",
      answers: {
        q1: {
          questionId: "q1",
          value: { choiceId: "a" },
          status: "answered",
          updatedAt: "2026-09-28T00:00:00.000Z",
        },
      },
      missingNodeStates: {},
      ambiguityNodeStates: {},
      analysisIntent: null,
      userContext: null,
    },
    answerSnapshotId: "placeholder",
  };
}

function answerSnapshotsGateway(): HiveGateway {
  const rows: HiveRow[] = [];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    async insert(_table, row) {
      const duplicate = rows.find(
        (candidate) =>
          candidate.case_id === row.case_id &&
          candidate.snapshot_hash === row.snapshot_hash,
      );
      if (duplicate) {
        throw new Error(
          'duplicate key value violates unique constraint "answer_snapshots_case_id_snapshot_hash_key"',
        );
      }
      rows.push({ ...row });
    },
    async upsert(_table, row, onConflict) {
      const index = rows.findIndex((candidate) => candidate[onConflict] === row[onConflict]);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...row };
        return;
      }
      rows.push({ ...row });
    },
    async updateWhere() {
      throw new Error("unused");
    },
    async selectWhere(_table, where, options) {
      let selected = rows.filter((row) => matches(row, where));
      if (options?.limit) {
        selected = selected.slice(0, options.limit);
      }
      return selected.map((row) => ({ ...row }));
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject() {
      throw new Error("unused");
    },
    async removeObject() {
      return undefined;
    },
  };
}

describe("study run concurrency acceptance (server composition)", () => {
  it("two simultaneous identical runs share one answer snapshot and one intelligence revision", async () => {
    const snapshots = new SupabaseAnswerSnapshotRepository(answerSnapshotsGateway(), USER_ID);
    const request = studyRequest();
    const snapshotInput = {
      caseId: request.caseId,
      questionSetId: request.answerSnapshot.questionSetId,
      snapshot: request.answerSnapshot as QuestionsAnswerSnapshot,
    };
    const [savedA, savedB] = await Promise.all([
      snapshots.save(snapshotInput),
      snapshots.save(snapshotInput),
    ]);
    expect(savedA.id).toBe(savedB.id);

    const runRepo = new InMemoryStudyRunRepository();
    const intel = new InMemoryCaseIntelligenceRepository();
    const projections = new InMemoryCaseProjectionRepository();
    const domainLearning = createInMemoryDomainLearningPort();
    const inFlight = new Map();
    const deps: StudyServiceDeps = {
      engine: new FixtureCanonicalStudyEngine(),
      providerId: "fixture-canonical-study-engine",
      providerMode: "fixture",
      contextRepo: new InMemoryStudyContextRepository(),
      runRepo,
      eventRepo: new InMemoryStudyRunEventRepository(),
      intelligenceRepo: intel,
      projectionRepo: projections,
      prompt: loadCanonicalStudyPrompt("canonical-study-v3"),
      inFlight,
      sessionUserId: USER_ID,
      domainLearning,
    };

    const prepared = {
      ...request,
      answerSnapshotId: savedA.id,
    };
    const [outcomeA, outcomeB] = await Promise.all([
      runCanonicalStudy(prepared, deps),
      runCanonicalStudy(prepared, deps),
    ]);

    expect(outcomeA.run.status).toBe("SUCCEEDED");
    expect(outcomeB.run.status).toBe("SUCCEEDED");
    expect(outcomeA.run.studyRunId).toBe(outcomeB.run.studyRunId);
    expect(await intel.getLatestVersion(request.caseId)).toBe(1);
    expect(await projections.getByVersionAndKind(request.caseId, 1, "customer")).not.toBeNull();
    expect(await projections.getByVersionAndKind(request.caseId, 1, "pro")).not.toBeNull();
    expect(
      (await domainLearning.lineage.listByStudyRun(outcomeA.run.studyRunId)).length,
    ).toBeGreaterThan(0);
  });
});
