import { describe, expect, it } from "vitest";

import {
  assembleIntakeStudyRequest,
  buildEngine1ResultFromIntakePack,
  fingerprintIntakeStudyMaterial,
  intakePackExecutionToStructureMap,
} from "./intake-study-context";

const packExecution = {
  schemaVersion: "intake-pack-execution/1",
  domainPackId: "domain-pack/iep",
  domainPackVersion: "0.0.0-test",
  logicalDocuments: [
    {
      logicalDocumentId: "logic-1",
      sourceDocumentId: "src-1",
      pageStart: 1,
      pageEnd: 3,
      documentFamily: "IEP",
      documentSubtype: null,
      processingDisposition: "PROCESS" as const,
      classificationConfidence: 0.9,
      classificationReason: "test",
      customerLabel: "Individualized Education Program",
    },
  ],
  completeness: {
    expectations: [],
    collectionNeedsReview: false,
  },
};

describe("intake study context", () => {
  it("builds structure map and engine1 inventory from pack execution", () => {
    const present = new Set(["src-1"]);
    const structureMap = intakePackExecutionToStructureMap({
      caseId: "case-1",
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackId: "domain-pack/iep",
      domainPackVersion: "0.0.0-test",
      packExecution,
      sources: [
        {
          id: "src-1",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      presentSourceIds: present,
    });

    expect(structureMap.logicalDocuments).toHaveLength(1);
    expect(structureMap.logicalDocuments[0]?.id).toBe("logic-1");
    expect(structureMap.discoverRunId).toBe("intake-1");

    const engine1 = buildEngine1ResultFromIntakePack({
      domainId: "iep",
      domainLabel: "Special education records",
      packExecution,
      presentSourceIds: present,
    });
    expect(engine1.documents[0]?.id).toBe("logic-1");
  });

  it("includes a document that was too short to classify", () => {
    const shortPack = {
      ...packExecution,
      logicalDocuments: [
        {
          ...packExecution.logicalDocuments[0]!,
          logicalDocumentId: "logic-short",
          sourceDocumentId: "src-short",
          processingDisposition: "NEEDS_REVIEW" as const,
          classificationReason: "unmatched",
          customerLabel: "Other",
        },
      ],
    };
    const request = assembleIntakeStudyRequest({
      caseId: "case-1",
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackVersion: "0.0.0-test",
      packExecution: shortPack,
      identities: [{ sourceDocumentId: "src-short", analysisDisposition: "PRESENT" }],
      sources: [
        {
          id: "src-short",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "signature.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(request.sourceDocuments.map((doc) => doc.sourceDocumentId)).toEqual(["src-short"]);
    expect(request.engine1Result.documents.map((doc) => doc.stagedDocumentId)).toEqual(["src-short"]);
  });

  it("assembles a start request with intake fingerprints", () => {
    const request = assembleIntakeStudyRequest({
      caseId: "case-1",
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackVersion: "0.0.0-test",
      packExecution,
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
      sources: [
        {
          id: "src-1",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    expect(request.intakeRunId).toBe("intake-1");
    expect(request.intakeStudyMaterialFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(request.sourceDocuments).toHaveLength(1);
    expect(request.questionSet.questions).toHaveLength(0);

    const withPurpose = assembleIntakeStudyRequest({
      caseId: "case-1",
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackVersion: "0.0.0-test",
      packExecution,
      statedWorkPurpose: "Prepare for IEP meeting next week",
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
      sources: [
        {
          id: "src-1",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(withPurpose.answerSnapshot.userContext).toMatchObject({
      statedWorkPurpose: "Prepare for IEP meeting next week",
    });

    const fingerprintAgain = fingerprintIntakeStudyMaterial({
      intakeRunId: "intake-1",
      packExecution,
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
      sources: request.sourceDocuments.map((doc) => ({
        id: doc.sourceDocumentId!,
        caseId: "case-1",
        userId: "user-1",
        clientStagedId: null,
        originalFilename: doc.originalFilename,
        mimeType: doc.mimeType ?? null,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256 ?? "abc",
        storageBucket: doc.storageBucket ?? "b",
        storagePath: doc.storagePath ?? "p",
        status: "stored" as const,
        intakeRunId: "intake-1",
        studyRunId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    });
    expect(fingerprintAgain).toBe(request.intakeStudyMaterialFingerprint);
  });

  it("changes fingerprint when a source is discarded from analysis", () => {
    const base = fingerprintIntakeStudyMaterial({
      intakeRunId: "intake-1",
      packExecution,
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "PRESENT" }],
      sources: [
        {
          id: "src-1",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const discarded = fingerprintIntakeStudyMaterial({
      intakeRunId: "intake-1",
      packExecution,
      identities: [{ sourceDocumentId: "src-1", analysisDisposition: "DISCARDED" }],
      sources: [
        {
          id: "src-1",
          caseId: "case-1",
          userId: "user-1",
          clientStagedId: null,
          originalFilename: "iep.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          sha256: "abc",
          storageBucket: "b",
          storagePath: "p",
          status: "stored",
          intakeRunId: "intake-1",
          studyRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    expect(discarded).not.toBe(base);
  });

  it("passes the latest-dated IEP through as the current plan", () => {
    const datedPack = {
      ...packExecution,
      logicalDocuments: [
        {
          ...packExecution.logicalDocuments[0]!,
          logicalDocumentId: "doc-02:1-2",
          sourceDocumentId: "src-02",
          documentFamily: "IEP",
          documentSubtype: "iep",
          customerLabel: "IEP",
          documentDate: "2023-10-24",
          temporalRole: "prior",
          sourceFilename: "02_prior_iep.pdf",
        },
        {
          ...packExecution.logicalDocuments[0]!,
          logicalDocumentId: "doc-09:1-3",
          sourceDocumentId: "src-09",
          documentFamily: "IEP",
          documentSubtype: "iep",
          customerLabel: "Reevaluation IEP",
          documentDate: "2026-10-21",
          temporalRole: "current",
          sourceFilename: "09_reevaluation_iep.pdf",
        },
      ],
    };
    const present = new Set(["src-02", "src-09"]);
    const source = (id: string, filename: string) => ({
      id,
      caseId: "case-1",
      userId: "user-1",
      clientStagedId: null,
      originalFilename: filename,
      mimeType: "application/pdf",
      sizeBytes: 100,
      sha256: "abc",
      storageBucket: "b",
      storagePath: "p",
      status: "stored" as const,
      intakeRunId: "intake-1",
      studyRunId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const structureMap = intakePackExecutionToStructureMap({
      caseId: "case-1",
      intakeRunId: "intake-1",
      domainId: "iep",
      domainLabel: "Special education records",
      domainPackId: "domain-pack/iep",
      domainPackVersion: "0.0.0-test",
      packExecution: datedPack,
      sources: [source("src-02", "02_prior_iep.pdf"), source("src-09", "09_reevaluation_iep.pdf")],
      presentSourceIds: present,
    });
    const current = structureMap.logicalDocuments.find((doc) => doc.familyRole === "current");
    const prior = structureMap.logicalDocuments.find((doc) => doc.familyRole === "prior");
    expect(current?.documentDate).toBe("2026-10-21");
    expect(prior?.documentDate).toBe("2023-10-24");
    expect(structureMap.chronology.map((entry) => entry.orderingKey)).toEqual([
      "2023-10-24",
      "2026-10-21",
    ]);
    expect(structureMap.relationships).toEqual([
      expect.objectContaining({
        fromLogicalDocumentId: "doc-02:1-2",
        toLogicalDocumentId: "doc-09:1-3",
        kind: "precedes",
      }),
    ]);
  });
});
