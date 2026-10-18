import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compilePackDrivenReaderPrompt,
  computeProposalPackContentSha256,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import type { DocumentPages } from "../document/page-model.js";
import { evaluateArch05L001Acceptance } from "../../../domain-packs/iep/qualification/arch05-l001.js";
import { buildCanonicalStudyFoundation } from "./canonical-study-foundation/index.js";
import { buildCanonicalStudy } from "./canonical-study/index.js";
import { fieldQuote } from "./canonical-study/test-fixtures.js";
import { resolveStudyDeclarativePackBinding } from "./resolve-study-declarative-pack.js";
import {
  PinnedProposalDomainPackError,
  resolvePinnedProposalDomainPackFromStudyContext,
  resolveStudyReaderProposalPackBindingFromContext,
} from "./resolve-pinned-proposal-domain-pack.js";
import { L001_READER_PACK_CONTENT_SHA256 } from "./resolve-canonical-study-interpretation.js";

describe("resolvePinnedProposalDomainPackFromStudyContext", () => {
  it("loads compiled IEP v0.2.1 by persisted declarative digest (not brain manifest hash)", () => {
    const env = {
      HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "1",
      HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1",
    };
    const { binding, selection } = resolveStudyDeclarativePackBinding({ domainId: "iep", env });
    const proposalSha = computeProposalPackContentSha256(selection.compiledProposalPack).toLowerCase();
    expect(proposalSha).not.toBe(binding.contentDigest);

    const snapshotsDir = mkdtempSync(join(tmpdir(), "hive-pinned-pack-"));
    const resolved = resolvePinnedProposalDomainPackFromStudyContext({
      context: {
        domainId: "iep",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          declarativePackBinding: binding,
          proposalPackContentSha256: proposalSha,
        },
      },
      env: { ...env, HIVE_PROPOSAL_PACK_SNAPSHOTS_DIR: snapshotsDir },
    });

    expect(resolved.source).toBe("declarative-compiled");
    expect(resolved.contentSha256).toBe(proposalSha);
    expect(resolved.identity.packContentSha256).toBe(proposalSha);
    expect(resolved.pack.manifest.id).toBe("iep");
    expect(readFileSync(resolved.path, "utf8")).toContain('"manifest"');
  });

  it("pins the same compiled pack on retry without resolving latest", () => {
    const env = {
      HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "1",
      HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1",
    };
    const first = resolveStudyDeclarativePackBinding({ domainId: "iep", env });
    const retry = resolveStudyDeclarativePackBinding({
      domainId: "iep",
      env,
      existingBinding: first.binding,
    });
    const proposalSha = computeProposalPackContentSha256(retry.selection.compiledProposalPack).toLowerCase();

    const resolved = resolvePinnedProposalDomainPackFromStudyContext({
      context: {
        domainId: "iep",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          declarativePackBinding: retry.binding,
          proposalPackContentSha256: proposalSha,
        },
      },
      env,
    });

    expect(resolved.contentSha256).toBe(proposalSha);
    expect(resolved.pack).toEqual(retry.selection.compiledProposalPack);
  });

  it("runs synthetic declarative pack through the same pinned resolver path", () => {
    const env = {
      HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "1",
      HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1",
    };
    const { binding, selection } = resolveStudyDeclarativePackBinding({
      domainId: "synthetic-declarative",
      env,
    });
    const proposalSha = computeProposalPackContentSha256(selection.compiledProposalPack).toLowerCase();
    const resolved = resolvePinnedProposalDomainPackFromStudyContext({
      context: {
        domainId: "synthetic-declarative",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          declarativePackBinding: binding,
          proposalPackContentSha256: proposalSha,
        },
      },
      env,
    });
    expect(resolved.pack.manifest.id).toBe("synthetic-declarative");
    expect(resolved.source).toBe("declarative-compiled");
  });

  it("fails closed when declarative digest is unknown", () => {
    expect(() =>
      resolvePinnedProposalDomainPackFromStudyContext({
        context: {
          domainId: "iep",
          processingPolicy: {
            intentAffectsFacts: false,
            providerId: "pack-driven-reader",
            providerMode: "reader_delegated",
            declarativePackBinding: {
              domainPackId: "iep",
              domainPackVersion: "0.2.1",
              packContractVersion: "domain-pack-declarative/0.2",
              contentDigest: "f".repeat(64),
              packVersionLabel: "0.2.1-draft",
            },
          },
        },
        env: { HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1" },
      }),
    ).toThrow(PinnedProposalDomainPackError);
  });

  it("keeps legacy snapshot binding when no declarativePackBinding is present", () => {
    const identity = resolveStudyReaderProposalPackBindingFromContext({
      context: {
        domainId: "iep",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          proposalPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
        },
      },
    });
    expect(identity.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });
});

const L001_TEST_HERE = dirname(fileURLToPath(import.meta.url));
const L001_REPO_ROOT = join(L001_TEST_HERE, "../../../..");
const L001_MANIFEST = join(L001_REPO_ROOT, "engine/intake/fixtures/l001/manifest.json");
const L001_PAGES_DIR = join(L001_REPO_ROOT, "engine/intake/fixtures/l001/document-pages");

const L001_DOCUMENT_TYPE_BY_FILENAME: Record<string, string> = {
  "01_initial_referral.pdf": "referral",
  "02_evaluation_plan.pdf": "evaluation_plan",
  "03_parent_evaluation_consent.pdf": "parent_consent",
  "04_psychoeducational_evaluation.pdf": "psychoeducational_evaluation",
  "05_academic_evaluation.pdf": "academic_evaluation",
  "06_speech_language_evaluation.pdf": "speech_language_evaluation",
  "07_eligibility_determination.pdf": "eligibility",
  "08_initial_iep.pdf": "iep_initial",
};

function loadL001Pages(filename: string, sourceDocumentId: string): DocumentPages {
  const raw = JSON.parse(readFileSync(join(L001_PAGES_DIR, filename.replace(".pdf", ".json")), "utf8")) as {
    documentPages: DocumentPages;
  };
  return { ...raw.documentPages, documentId: sourceDocumentId };
}

describe("L001 declarative pinned pack integration", () => {
  const env = {
    HIVE_DECLARATIVE_STUDY_PACK_RESOLVER: "1",
    HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE: "1",
  };

  it("maps eight L001 fixtures to v0.2.1 document types and compiles Reader prompts", () => {
    const { binding } = resolveStudyDeclarativePackBinding({ domainId: "iep", env });
    const pinned = resolvePinnedProposalDomainPackFromStudyContext({
      context: {
        domainId: "iep",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          declarativePackBinding: binding,
        },
      },
      env,
    });

    const manifest = JSON.parse(readFileSync(L001_MANIFEST, "utf8")) as {
      files: Array<{ filename: string; sourceDocumentId: string }>;
    };
    expect(manifest.files).toHaveLength(8);

    const packDocTypeIds = new Set(pinned.pack.documentTypes.map((doc) => doc.id));
    for (const file of manifest.files) {
      const documentTypeId = L001_DOCUMENT_TYPE_BY_FILENAME[file.filename];
      expect(documentTypeId, file.filename).toBeTruthy();
      expect(packDocTypeIds.has(documentTypeId!)).toBe(true);

      const pageText =
        loadL001Pages(file.filename, file.sourceDocumentId).pages[0]?.canonicalText?.slice(0, 400) ??
        "fixture";
      const compiled = compilePackDrivenReaderPrompt({
        pack: pinned.pack,
        caseManifest: manifest.files.map((entry) => ({
          sourceDocumentId: entry.sourceDocumentId,
          filename: entry.filename,
          pageCount: 1,
          documentTypeId: L001_DOCUMENT_TYPE_BY_FILENAME[entry.filename],
        })),
        document: {
          sourceDocumentId: file.sourceDocumentId,
          pages: [{ pageNumber: 1, text: pageText }],
        },
      });
      expect(compiled.stableSystemPrefix.length).toBeGreaterThan(200);
      expect(compiled.packContentSha256).toBe(pinned.contentSha256);
    }
  });

  it("consolidates eight L001 documents without false plan absence (initial IEP MODEL_ERROR)", () => {
    const { binding } = resolveStudyDeclarativePackBinding({ domainId: "iep", env });
    const pinned = resolvePinnedProposalDomainPackFromStudyContext({
      context: {
        domainId: "iep",
        processingPolicy: {
          intentAffectsFacts: false,
          providerId: "pack-driven-reader",
          providerMode: "reader_delegated",
          declarativePackBinding: binding,
        },
      },
      env,
    });

    const manifest = JSON.parse(readFileSync(L001_MANIFEST, "utf8")) as {
      files: Array<{ filename: string; sourceDocumentId: string }>;
    };

    const foundation = buildCanonicalStudyFoundation({
      pack: pinned.pack,
      packContentSha256: pinned.contentSha256,
      caseId: "case-l001",
      createdAt: "2026-01-01T00:00:00.000Z",
      documents: manifest.files.map((file) => {
        const documentTypeId = L001_DOCUMENT_TYPE_BY_FILENAME[file.filename] ?? "UNKNOWN";
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
            packId: pinned.identity.packId,
            packVersion: pinned.identity.packVersion,
            packContentSha256: pinned.contentSha256,
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
              : {
                  sourceDocumentId: file.sourceDocumentId,
                  documentTypeId,
                  recordInstances: [
                    {
                      recordTypeId: "document_header",
                      instanceIndex: 0,
                      fields: [
                        fieldQuote(
                          "effective_start",
                          "date",
                          "2024-01-01",
                          file.sourceDocumentId,
                          1,
                          "2024-01-01",
                        ),
                      ],
                    },
                  ],
                },
            sanitizedError: isInitialIep
              ? { code: "MODEL_TIMEOUT", message: "Reader model call timed out." }
              : undefined,
          },
        };
      }),
    });

    const study = buildCanonicalStudy({
      pack: pinned.pack,
      packContentSha256: pinned.contentSha256,
      foundation,
      createdAt: "2026-01-01T00:00:00.000Z",
      sourceContext: {
        asOfDate: "2026-10-21",
        logicalDocuments: manifest.files.map((file) => ({
          sourceDocumentId: file.sourceDocumentId,
          filename: file.filename,
        })),
      },
    });

    const planNotFound = study.requirements.filter(
      (result) =>
        result.outcome === "NOT_FOUND_IN_SUPPLIED_DOCUMENTS" &&
        (result.scope.includes("iep_initial") || result.scope.includes("iep.plan")),
    );
    expect(planNotFound).toHaveLength(0);

    const firedAbsenceFlags = study.flags.filter(
      (flag) => flag.status === "fired" && flag.message === "absenceOf_verified",
    );
    expect(firedAbsenceFlags).toHaveLength(0);

    const acceptance = evaluateArch05L001Acceptance(study, null);
    const byId = new Map(acceptance.map((check) => [check.id, check]));
    expect(byId.get("no_false_absence_findings")?.pass).toBe(true);
    expect(byId.get("as_of_date_preserved")?.pass).toBe(true);

    const pendingGolden = [
      "same_date_42_wcpm_corroboration",
      "75_wcpm_planned_target",
      "150_minutes_per_week_derived",
      "reading_goal_recognized",
      "one_student_eight_versions",
    ].filter((id) => byId.get(id)?.pass !== true);
    expect(pendingGolden.length).toBe(5);
  });
});
