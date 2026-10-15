import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IntakeEvidenceWorkspaceView } from "@hiveforyou/shared/intake";

import type { HiveGateway, HiveRow } from "@/lib/persistence/hive-gateway";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: vi.fn(),
  createAuthenticatedHiveGateway: vi.fn(),
}));

vi.mock("@/lib/intake/intake-service-server", () => ({
  readIntakeEvidenceWorkspaceView: vi.fn(),
}));

import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";
import { readIntakeEvidenceWorkspaceView } from "@/lib/intake/intake-service-server";
import { loadHiveExtractionProgressForSession } from "./hive-extraction-progress-server";

const USER_ID = "user-1";
const CASE_ID = "case-1";
const STUDY_RUN_ID = "study-1";
const INTAKE_RUN_ID = "intake-1";
const SRC_1 = "src-doc-1";
const SRC_2 = "src-doc-2";

function matches(row: HiveRow, where: Record<string, string | number>): boolean {
  return Object.entries(where).every(
    ([column, value]) => String(row[column]) === String(value),
  );
}

function buildGateway(): HiveGateway {
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
            intake_run_id: INTAKE_RUN_ID,
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
    async downloadObject() {
      throw new Error("missing object");
    },
    async removeObject() {
      return undefined;
    },
  };
}

describe("loadHiveExtractionProgressForSession", () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUserId).mockReset();
    vi.mocked(createAuthenticatedHiveGateway).mockReset();
    vi.mocked(readIntakeEvidenceWorkspaceView).mockReset();
  });

  it("returns intake document rows when RUNNING with no reader envelopes", async () => {
    vi.mocked(getAuthenticatedUserId).mockResolvedValue(USER_ID);
    vi.mocked(createAuthenticatedHiveGateway).mockResolvedValue(buildGateway() as never);
    vi.mocked(readIntakeEvidenceWorkspaceView).mockResolvedValue({
      documents: [
        {
          sourceDocumentId: SRC_1,
          processingStatus: "CLASSIFIED",
          label: null,
          filename: "Annual_IEP.pdf",
          sizeBytes: 100,
        },
        {
          sourceDocumentId: SRC_2,
          processingStatus: "CLASSIFIED",
          label: null,
          filename: "Psychoed_Report.pdf",
          sizeBytes: 200,
        },
      ],
      thingsThatWouldHelp: [],
    } as unknown as IntakeEvidenceWorkspaceView);

    const view = await loadHiveExtractionProgressForSession({
      caseId: CASE_ID,
      studyRunId: STUDY_RUN_ID,
    });

    expect(view.studyRunStatus).toBe("RUNNING");
    expect(view.rawExtractionOutcome).toBeNull();
    expect(view.intakeRunId).toBe(INTAKE_RUN_ID);
    expect(view.documents).toHaveLength(2);
    expect(view.documents[0]).toMatchObject({
      sourceDocumentId: SRC_1,
      label: "Annual_IEP.pdf",
      uiStatus: "waiting",
      dateLabel: null,
    });
    expect(view.documents[1]?.label).toBe("Psychoed_Report.pdf");
  });
});