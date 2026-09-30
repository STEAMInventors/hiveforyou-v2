import { describe, expect, it } from "vitest";

import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { SourceDocumentRecord } from "./source-document-repository";
import { resolvePhysicalSourceDocuments } from "./resolve-physical-source-documents";

const USER = "user-a";
const CASE = "case-a";

function record(
  partial: Partial<SourceDocumentRecord> & Pick<SourceDocumentRecord, "id" | "originalFilename">,
): SourceDocumentRecord {
  return {
    userId: USER,
    caseId: CASE,
    intakeRunId: null,
    studyRunId: null,
    clientStagedId: null,
    mimeType: "application/pdf",
    sizeBytes: 100,
    storageBucket: "docs",
    storagePath: `path/${partial.id}.pdf`,
    sha256: `sha-${partial.id}`,
    status: "stored",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function engine1WithEightDocs(): DocumentDiscoveryResult {
  return {
    domainLabel: "Special education records",
    domainResolutionStatus: "resolved",
    groups: [],
    relationships: [],
    missingDocuments: [],
    documents: Array.from({ length: 8 }, (_, index) => ({
      id: `disc-${index + 1}`,
      stagedDocumentId: `stage-${index + 1}`,
      documentType: "Document",
      title: `Doc ${index + 1}`,
      originalFilename: `file-${index + 1}.pdf`,
      sizeBytes: 100,
      familyRole: "primary",
      groupId: "g1",
      recognitionStatus: "recognized" as const,
    })),
  };
}

describe("resolvePhysicalSourceDocuments", () => {
  it("returns exactly 8 physical sources when 32 stale rows exist for 8 discovery documents", () => {
    const engine1 = engine1WithEightDocs();
    const documents: SourceDocumentRecord[] = [];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      for (let index = 0; index < 8; index += 1) {
        const staged = `stage-${index + 1}`;
        documents.push(
          record({
            id: `persist-${attempt}-${index}`,
            clientStagedId: staged,
            originalFilename: `file-${index + 1}.pdf`,
            storagePath: `path/${staged}-attempt-${attempt}.pdf`,
            sha256: `sha-${staged}-${attempt}`,
            createdAt: `2026-01-0${attempt + 1}T00:00:00.000Z`,
            updatedAt: `2026-01-0${attempt + 1}T00:00:00.000Z`,
          }),
        );
      }
    }

    const resolved = resolvePhysicalSourceDocuments({
      documents,
      engine1Result: engine1,
      caseId: CASE,
      actorUserId: USER,
    });

    expect(resolved).toHaveLength(8);
    expect(new Set(resolved.map((doc) => doc.originalFilename)).size).toBe(8);
    for (const doc of resolved) {
      expect(doc.createdAt.startsWith("2026-01-04")).toBe(true);
    }
  });
});
