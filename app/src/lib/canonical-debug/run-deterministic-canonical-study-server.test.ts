import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION } from "@hiveforyou/core/document/trusted-document-pages";
import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  documentPagesStoragePath,
  readerDocumentExtractionStudyRunManifestPath,
} from "@hiveforyou/shared/hive-artifact-paths";
import { NESTIEP_EXTRACTOR_VERSION } from "@hiveforyou/shared/intake";
import { READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/reader-document-extraction";

const SYNTHETIC_PACK: ProposalDomainPack = {
  schemaVersion: "hive.domain-pack.proposal/0.3.0",
  manifest: { id: "synthetic-test", version: "0.0.1" },
  relationshipRules: {
    changeRequiresTemporalSuccession: true,
    temporalSuccessionFieldIds: ["effective_date", "observed_on"],
    conflictWhenDifferentParties: true,
  },
  compositionRules: [],
  requirements: { rules: [] },
  insightChecks: { enginePrimitivesRequired: [], checks: [] },
  documentTypes: [
    {
      id: "doc.plan",
      authorRole: "party_a",
      orderingDate: "document_header.effective_date",
      checklist: ["document_header"],
    },
  ],
  authorRoles: [{ id: "party_a", party: "alpha" }],
  recordTypes: [
    {
      id: "document_header",
      repeatable: false,
      identity: {
        scope: "document",
        keyFields: [],
        caseSingletonMerge: "never_auto_merge",
        versionAxis: "document.orderingDate",
      },
      fields: [
        { id: "effective_date", valueKind: "date", source: ["quoted"], modality: ["observed"] },
      ],
    },
  ],
  readingNotes: { global: "test", byDocumentType: {} },
};

const PACK_SHA = computeProposalPackContentSha256(SYNTHETIC_PACK).toLowerCase();

import type { HiveGateway, HiveRow } from "@/lib/persistence/hive-gateway";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
  createServerSupabaseClient: vi.fn(async () => ({})),
}));

vi.mock("@/lib/persistence/hive-gateway", () => ({
  createSupabaseHiveGateway: vi.fn(),
}));

import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  PackNotAvailableError,
  SourcePagesUnavailableError,
  runDeterministicCanonicalStudy,
} from "./run-deterministic-canonical-study-server";

const USER_ID = "user-1";
const CASE_ID = "case-1";
const STUDY_RUN_ID = "study-1";
const ATTEMPT_ID = "attempt-1";
const SOURCE_DOC_ID = "doc-1";
const SOURCE_DOC_SHA = "abc123";

function encodeDocumentPagesPayload(sourceDocumentId: string, sha256: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: DOCUMENT_PAGES_PAYLOAD_SCHEMA_VERSION,
      extractorVersion: NESTIEP_EXTRACTOR_VERSION,
      documentPages: {
        documentId: sourceDocumentId,
        sha256,
        pages: [
          {
            documentId: sourceDocumentId,
            pageNumber: 1,
            width: 100,
            height: 100,
            rotation: 0,
            route: "native",
            imageRef: null,
            words: [
              {
                seq: 0,
                text: "2024-01-01",
                bbox: [0, 0, 1, 1],
                confidence: 1,
                fontName: null,
                fontSize: null,
                bold: null,
                italic: null,
                source: "native",
              },
            ],
            quality: {
              textCoverage: 1,
              meanConfidence: 1,
              garbageRatio: 0,
              illegibleRegions: [],
            },
          },
        ],
        formFields: [],
      },
    }),
  );
}

function matches(row: HiveRow, where: Record<string, string | number>): boolean {
  return Object.entries(where).every(
    ([column, value]) => String(row[column]) === String(value),
  );
}

function buildEnvelope() {
  return {
    schemaVersion: READER_DOCUMENT_EXTRACTION_SCHEMA_VERSION,
    studyRunId: STUDY_RUN_ID,
    attemptId: ATTEMPT_ID,
    caseId: CASE_ID,
    userId: USER_ID,
    sourceDocumentId: SOURCE_DOC_ID,
    domainId: "iep",
    packId: SYNTHETIC_PACK.manifest.id,
    packVersion: SYNTHETIC_PACK.manifest.version,
    packContentSha256: PACK_SHA,
    promptVersion: "hive-reader-prompt/2.0.0",
    modelProvider: "anthropic",
    modelId: "claude-test",
    status: "SUCCEEDED" as const,
    occurredAt: "2026-10-12T12:00:00Z",
    parsedModelJson: {
      sourceDocumentId: SOURCE_DOC_ID,
      documentTypeId: "doc.plan",
      recordInstances: [
        {
          recordTypeId: "document_header",
          instanceIndex: 0,
          fields: [
            {
              fieldId: "effective_date",
              valueKind: "date",
              value: "2024-01-01",
              evidence: [{ sourceDocumentId: SOURCE_DOC_ID, page: 1, quote: "2024-01-01" }],
            },
          ],
        },
      ],
    },
  };
}

function buildGateway(): HiveGateway {
  const studyRunManifestPath = readerDocumentExtractionStudyRunManifestPath(USER_ID, STUDY_RUN_ID);
  const attemptManifestPath = `${USER_ID}/reader-document-extractions/${STUDY_RUN_ID}/${ATTEMPT_ID}/manifest.json`;
  const envelopePath = `${USER_ID}/reader-document-extractions/${STUDY_RUN_ID}/${ATTEMPT_ID}/${SOURCE_DOC_ID}.json`;
  const envelope = buildEnvelope();
  const storage = new Map<string, Uint8Array>([
    [
      studyRunManifestPath,
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: "hive.reader-document-extraction-manifest/1",
          studyRunId: STUDY_RUN_ID,
          caseId: CASE_ID,
          latestAttemptId: ATTEMPT_ID,
          updatedAt: "2026-10-12T12:00:00Z",
          latestAttemptManifestObjectKey: attemptManifestPath,
        }),
      ),
    ],
    [
      attemptManifestPath,
      new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: "hive.reader-document-extraction-manifest/1",
          studyRunId: STUDY_RUN_ID,
          attemptId: ATTEMPT_ID,
          caseId: CASE_ID,
          updatedAt: "2026-10-12T12:00:00Z",
          documents: [
            {
              sourceDocumentId: SOURCE_DOC_ID,
              status: "SUCCEEDED",
              envelopeObjectKey: envelopePath,
            },
          ],
        }),
      ),
    ],
    [envelopePath, new TextEncoder().encode(JSON.stringify(envelope))],
    [
      documentPagesStoragePath(USER_ID, SOURCE_DOC_SHA),
      encodeDocumentPagesPayload(SOURCE_DOC_ID, SOURCE_DOC_SHA),
    ],
  ]);

  return {
    async insert() {
      throw new Error("unused");
    },
    async upsert() {
      throw new Error("unused");
    },
    async updateWhere() {
      throw new Error("unused");
    },
    async selectWhere(table, where) {
      if (table === "cases") {
        return [
          {
            id: CASE_ID,
            user_id: USER_ID,
            domain_id: "iep",
            created_at: "2026-10-12T12:00:00Z",
            updated_at: "2026-10-12T12:00:00Z",
          },
        ].filter((row) => matches(row, where));
      }
      if (table === "study_runs") {
        return [
          {
            id: STUDY_RUN_ID,
            case_id: CASE_ID,
            user_id: USER_ID,
            idempotency_key: "idem-1",
            study_context_version: "canonical-study-context/1",
            study_context_id: STUDY_RUN_ID,
            domain_id: "iep",
            domain_pack_id: "hive.domain.iep",
            domain_pack_version: "scaffold",
            engine_provider: "fixture-canonical-study-engine",
            provider_mode: "fixture",
            prompt_id: "canonical-study",
            prompt_version: "canonical-study-v1",
            prompt_sha256: "abc123",
            question_set_version: "qs-1",
            answer_snapshot_hash: "hash-1",
            status: "SUCCEEDED",
            started_at: "2026-10-12T12:00:00Z",
            completed_at: "2026-10-12T12:00:00Z",
            error_code: null,
            error_message_safe: null,
            validation_result_json: null,
            case_intelligence_version: null,
            intake_run_id: null,
            created_at: "2026-10-12T12:00:00Z",
            updated_at: "2026-10-12T12:00:00Z",
          },
        ].filter((row) => matches(row, where));
      }
      if (table === "study_contexts") {
        return [
          {
            context_json: {
              sourceDocuments: [{ sourceDocumentId: SOURCE_DOC_ID, sha256: SOURCE_DOC_SHA }],
              logicalDocuments: [{ sourceDocumentId: SOURCE_DOC_ID, logicalDocumentId: "ld-1" }],
            },
          },
        ];
      }
      if (table === "source_documents") {
        return [
          {
            id: SOURCE_DOC_ID,
            user_id: USER_ID,
            case_id: CASE_ID,
            intake_run_id: null,
            study_run_id: STUDY_RUN_ID,
            client_staged_id: "staged-1",
            original_filename: "doc.pdf",
            mime_type: "application/pdf",
            size_bytes: 100,
            storage_bucket: "source-documents",
            storage_path: `${USER_ID}/source-documents/${SOURCE_DOC_ID}.pdf`,
            sha256: SOURCE_DOC_SHA,
            created_at: "2026-10-12T12:00:00Z",
            updated_at: "2026-10-02T12:00:00Z",
          },
        ].filter((row) => matches(row, where));
      }
      if (table === "study_artifacts") {
        return [];
      }
      return [];
    },
    async uploadObject(_bucket, path, bytes) {
      storage.set(path, bytes);
    },
    async downloadObject(_bucket, path) {
      const bytes = storage.get(path);
      if (!bytes) {
        throw new Error("NOT_FOUND");
      }
      return bytes;
    },
    async removeObject() {
      throw new Error("unused");
    },
  };
}

describe("runDeterministicCanonicalStudy", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_ID);
    vi.mocked(createSupabaseHiveGateway).mockReturnValue(buildGateway());
    delete process.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON;
  });

  it("returns PACK_NOT_AVAILABLE when Reader envelope pack is unavailable", async () => {
    await expect(
      runDeterministicCanonicalStudy({ caseId: CASE_ID, studyRunId: STUDY_RUN_ID }),
    ).rejects.toBeInstanceOf(PackNotAvailableError);
  });

  it("returns SOURCE_PAGES_UNAVAILABLE when trusted pages are missing for documents with extracted facts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-debug-pack-"));
    try {
      const packPath = join(dir, "debug-pack.json");
      writeFileSync(
        packPath,
        JSON.stringify(SYNTHETIC_PACK),
        "utf8",
      );
      process.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON = packPath;

      const gatewayWithoutPages = buildGateway();
      vi.mocked(createSupabaseHiveGateway).mockReturnValue({
        ...gatewayWithoutPages,
        async downloadObject(_bucket, path) {
          if (path === documentPagesStoragePath(USER_ID, SOURCE_DOC_SHA)) {
            throw new Error("NOT_FOUND");
          }
          return gatewayWithoutPages.downloadObject(_bucket, path);
        },
      });

      await expect(
        runDeterministicCanonicalStudy({ caseId: CASE_ID, studyRunId: STUDY_RUN_ID }),
      ).rejects.toMatchObject({
        name: "SourcePagesUnavailableError",
        affectedDocumentIds: [SOURCE_DOC_ID],
      } satisfies Partial<SourcePagesUnavailableError>);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds and persists debug-labeled canonical study artifacts from Reader envelope pack metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-debug-pack-"));
    try {
      const packPath = join(dir, "debug-pack.json");
      writeFileSync(
        packPath,
        JSON.stringify(SYNTHETIC_PACK),
        "utf8",
      );
      process.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON = packPath;

      const result = await runDeterministicCanonicalStudy({
        caseId: CASE_ID,
        studyRunId: STUDY_RUN_ID,
      });

      expect(result.studyRunId).toBe(STUDY_RUN_ID);
      expect(result.attemptId).toBe(ATTEMPT_ID);
      expect(result.artifact.schemaVersion).toBe("hive.canonical-study/1");
      expect(result.foundation.schemaVersion).toBe("hive.canonical-study-foundation/1");
      expect(result.artifactObjectKey).toContain("/canonical-study/");
      expect(result.foundation.packApprovalLabel).toBe("DEBUG_UNAPPROVED_PACK");
      expect(result.foundation.customerProReportsPermitted).toBe(false);
      expect(result.artifact.packApprovalLabel).toBe("DEBUG_UNAPPROVED_PACK");
      expect(result.artifact.customerProReportsPermitted).toBe(false);
      expect(result.readerPack.packId).toBe(SYNTHETIC_PACK.manifest.id);
      expect(result.readerPack.packContentSha256).toBe(PACK_SHA);
      expect(result.readerPack.packSource).toBe("override");
      expect(result.canonicalRuleset.rulesetId).toBe("hive.canonical-study.deterministic");
      expect(result.artifact.readerPack.packContentSha256).toBe(PACK_SHA);
      expect(result.artifact.canonicalRuleset.rulesetContentSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
