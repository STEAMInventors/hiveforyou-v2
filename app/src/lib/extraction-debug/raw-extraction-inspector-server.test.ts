import { beforeEach, describe, expect, it, vi } from "vitest";

import { readerDocumentExtractionStudyRunManifestPath } from "@hiveforyou/shared/hive-artifact-paths";
import type { ReaderDocumentExtractionStudyRunManifest } from "@hiveforyou/shared/reader-document-extraction";

import type { HiveGateway, HiveRow } from "@/lib/persistence/hive-gateway";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
  createAuthenticatedHiveGateway: vi.fn(),
}));

import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";
import {
  RawExtractionNotFoundError,
  loadRawExtractionInspectorBundle,
} from "./raw-extraction-inspector-server";

const USER_ID = "user-1";
const CASE_ID = "case-1";
const STUDY_RUN_ID = "study-1";
const ATTEMPT_ID = "attempt-1";

const STUDY_RUN_MANIFEST: ReaderDocumentExtractionStudyRunManifest = {
  schemaVersion: "hive.reader-document-extraction-manifest/1",
  studyRunId: STUDY_RUN_ID,
  caseId: CASE_ID,
  latestAttemptId: ATTEMPT_ID,
  updatedAt: "2026-10-12T12:00:00Z",
  latestAttemptManifestObjectKey: `${USER_ID}/reader-document-extractions/${STUDY_RUN_ID}/${ATTEMPT_ID}/manifest.json`,
};

function matches(row: HiveRow, where: Record<string, string | number>): boolean {
  return Object.entries(where).every(
    ([column, value]) => String(row[column]) === String(value),
  );
}

function buildGateway(input?: {
  studyRunManifest?: ReaderDocumentExtractionStudyRunManifest | null;
}): HiveGateway {
  const studyRunManifest = input?.studyRunManifest ?? null;
  const studyRunManifestPath = readerDocumentExtractionStudyRunManifestPath(USER_ID, STUDY_RUN_ID);

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
    async selectWhere(_table, where, options) {
      if (_table === "cases") {
        const rows = [
          {
            id: CASE_ID,
            user_id: USER_ID,
            domain_id: "iep",
            created_at: "2026-10-12T12:00:00Z",
            updated_at: "2026-10-12T12:00:00Z",
          },
        ];
        let selected = rows.filter((row) => matches(row, where));
        if (options?.limit) {
          selected = selected.slice(0, options.limit);
        }
        return selected;
      }
      if (_table === "study_runs") {
        const rows = [
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
            status: "RUNNING",
            started_at: "2026-10-12T12:00:00Z",
            completed_at: null,
            error_code: null,
            error_message_safe: null,
            validation_result_json: null,
            case_intelligence_version: null,
            intake_run_id: null,
            created_at: "2026-10-12T12:00:00Z",
            updated_at: "2026-10-12T12:00:00Z",
          },
        ];
        let selected = rows.filter((row) => matches(row, where));
        if (options?.limit) {
          selected = selected.slice(0, options.limit);
        }
        return selected;
      }
      if (_table === "study_contexts" || _table === "study_artifacts") {
        return [];
      }
      return [];
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject(_bucket, objectKey) {
      if (studyRunManifest && objectKey === studyRunManifestPath) {
        return new TextEncoder().encode(JSON.stringify(studyRunManifest));
      }
      throw new Error(`missing object: ${objectKey}`);
    },
    async removeObject() {
      return undefined;
    },
  };
}

describe("loadRawExtractionInspectorBundle", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(createAuthenticatedHiveGateway).mockReset();
  });

  it("rejects another user's case", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue("user-other");
    vi.mocked(createAuthenticatedHiveGateway).mockResolvedValue({
      selectWhere: vi.fn(async () => []),
    } as never);

    await expect(
      loadRawExtractionInspectorBundle({ caseId: CASE_ID, studyRunId: STUDY_RUN_ID }),
    ).rejects.toMatchObject({ name: "CaseNotFoundError" });
  });

  it("throws when the study run has no raw extraction artifacts", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_ID);
    vi.mocked(createAuthenticatedHiveGateway).mockResolvedValue(buildGateway() as never);

    await expect(
      loadRawExtractionInspectorBundle({ caseId: CASE_ID, studyRunId: STUDY_RUN_ID }),
    ).rejects.toBeInstanceOf(RawExtractionNotFoundError);
  });

  it("loads when only the study-run manifest exists", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_ID);
    vi.mocked(createAuthenticatedHiveGateway).mockReturnValue(
      buildGateway({ studyRunManifest: STUDY_RUN_MANIFEST }) as never,
    );

    const bundle = await loadRawExtractionInspectorBundle({
      caseId: CASE_ID,
      studyRunId: STUDY_RUN_ID,
    });

    expect(bundle.attemptId).toBe(ATTEMPT_ID);
    expect(bundle.downloadPayload.studyRunManifest).toEqual(STUDY_RUN_MANIFEST);
    expect(bundle.documents).toEqual([]);
  });
});
