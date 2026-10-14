import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import type { DocumentPages } from "../../document/page-model.js";
import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";
import { buildCanonicalStudy } from "./index.js";
import { fieldQuote, mockPages } from "./test-fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../../../..");
const L001_MANIFEST = join(REPO_ROOT, "engine/intake/fixtures/l001/manifest.json");
const L001_PAGES_DIR = join(REPO_ROOT, "engine/intake/fixtures/l001/document-pages");
const IEP_PACK_PATH = join(REPO_ROOT, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");

const DOCUMENT_TYPE_BY_FILENAME: Record<string, string> = {
  "01_initial_referral.pdf": "iep.referral",
  "02_evaluation_plan.pdf": "iep.evaluation.plan",
  "03_parent_evaluation_consent.pdf": "iep.consent",
  "04_psychoeducational_evaluation.pdf": "iep.evaluation.psychoeducational",
  "05_academic_evaluation.pdf": "iep.evaluation.academic",
  "06_speech_language_evaluation.pdf": "iep.evaluation.speech_language",
  "07_eligibility_determination.pdf": "iep.eligibility",
  "08_initial_iep.pdf": "iep.plan",
};

function loadL001Pages(filename: string, sourceDocumentId: string): DocumentPages {
  const raw = JSON.parse(readFileSync(join(L001_PAGES_DIR, filename.replace(".pdf", ".json")), "utf8")) as {
    documentPages: DocumentPages;
  };
  return { ...raw.documentPages, documentId: sourceDocumentId };
}

function minimalSucceededJson(sourceDocumentId: string, documentTypeId: string) {
  return {
    sourceDocumentId,
    documentTypeId,
    recordInstances: [
      {
        recordTypeId: "document_header",
        instanceIndex: 0,
        fields: [
          fieldQuote("effective_start", "date", "2024-01-01", sourceDocumentId, 1, "2024-01-01"),
        ],
      },
    ],
  };
}

describe("ARCH-05 L001 initial IEP MODEL_ERROR regression", () => {
  it("yields zero plan NOT_FOUND requirements and zero fired absence insight checks", () => {
    const pack = JSON.parse(readFileSync(IEP_PACK_PATH, "utf8")) as ProposalDomainPack;
    const packContentSha256 = computeProposalPackContentSha256(pack);
    const manifest = JSON.parse(readFileSync(L001_MANIFEST, "utf8")) as {
      files: Array<{ filename: string; sourceDocumentId: string }>;
    };

    const foundation = buildCanonicalStudyFoundation({
      pack,
      packContentSha256,
      caseId: "case-l001",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: manifest.files.map((file) => {
        const documentTypeId = DOCUMENT_TYPE_BY_FILENAME[file.filename] ?? "UNKNOWN";
        const isInitialIep = file.sourceDocumentId === "l001-src-8";
        return {
          sourceDocumentId: file.sourceDocumentId,
          documentPages: loadL001Pages(file.filename, file.sourceDocumentId),
          envelope: {
            schemaVersion: "hive.reader-document-extraction/1" as const,
            studyRunId: "study-l001",
            attemptId: "attempt-l001",
            caseId: "case-l001",
            userId: "user-l001",
            sourceDocumentId: file.sourceDocumentId,
            domainId: "iep",
            packId: pack.manifest.id,
            packVersion: pack.manifest.version,
            packContentSha256,
            promptVersion: "hive-pack-driven-reader/0.2.0",
            modelProvider: "fixture",
            modelId: "fixture",
            status: isInitialIep ? ("MODEL_ERROR" as const) : ("SUCCEEDED" as const),
            occurredAt: "2026-01-01T00:00:00.000Z",
            parsedModelJson: isInitialIep
              ? {
                  sourceDocumentId: file.sourceDocumentId,
                  documentTypeId,
                  recordInstances: [],
                }
              : minimalSucceededJson(file.sourceDocumentId, documentTypeId),
            sanitizedError: isInitialIep
              ? { code: "MODEL_TIMEOUT", message: "Reader model call timed out." }
              : undefined,
          },
        };
      }),
    });

    expect(foundation.documents.find((doc) => doc.sourceDocumentId === "l001-src-8")?.extractionStatus).toBe(
      "MODEL_ERROR",
    );

    const study = buildCanonicalStudy({
      pack,
      packContentSha256,
      foundation,
      sourceContext: {
        logicalDocuments: manifest.files.map((file) => ({
          sourceDocumentId: file.sourceDocumentId,
          filename: file.filename,
        })),
      },
    });

    const planNotFound = study.requirements.filter(
      (result) =>
        result.outcome === "NOT_FOUND_IN_SUPPLIED_DOCUMENTS" &&
        result.scope.includes("iep.plan"),
    );
    expect(planNotFound).toHaveLength(0);

    const firedAbsenceFlags = study.flags.filter(
      (flag) => flag.status === "fired" && flag.message === "absenceOf_verified",
    );
    expect(firedAbsenceFlags).toHaveLength(0);

    const unresolvedFromCoverage = [
      ...study.requirements.filter((result) => result.message.includes("source_extraction_incomplete")),
      ...study.flags.filter((flag) => flag.message.includes("source_extraction_incomplete")),
    ];
    expect(unresolvedFromCoverage.length).toBeGreaterThan(0);
    expect(unresolvedFromCoverage.some((item) => item.message.includes("l001-src-8"))).toBe(true);

    const initialIepIncomplete = study.timeline.incomplete.filter(
      (entry) => entry.sourceDocumentId === "l001-src-8",
    );
    expect(initialIepIncomplete.length).toBeGreaterThan(0);
    expect(initialIepIncomplete[0]?.status).toBe("incomplete_extraction");
    expect(study.timeline.dated.some((entry) => entry.eventId === "initial_iep")).toBe(false);
  });
});
