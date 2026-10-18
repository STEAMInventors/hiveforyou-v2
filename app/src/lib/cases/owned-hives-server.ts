import "server-only";

import { requireSessionUserId, UnauthenticatedError } from "@hiveforyou/core";
import type { OwnedHiveDetailResponse, OwnedHiveListResponse } from "@hiveforyou/shared/cases";
import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";

import type { HiveGateway, HiveRow } from "@/lib/persistence/hive-gateway";
import { SupabaseCaseRepository } from "@/lib/persistence/supabase-repositories";
import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";

import {
  indexOwnedHiveWorkspacesByCaseId,
  type IntakeRunWorkspaceRef,
  type StudyRunWorkspaceRef,
} from "./owned-hive-workspace";

function toSummary(
  record: {
    id: string;
    domainId: string | null;
    createdAt: string;
    updatedAt: string;
  },
  workspace: OwnedHiveDetailResponse["workspace"],
): OwnedHiveDetailResponse {
  return {
    caseId: record.id,
    domainId: record.domainId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    workspace,
  };
}

function nullableText(row: HiveRow, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  return String(value);
}

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

async function loadWorkspaceRefsForUser(
  gateway: HiveGateway,
  userId: string,
): Promise<{ studyRuns: StudyRunWorkspaceRef[]; intakeRuns: IntakeRunWorkspaceRef[] }> {
  const [studyRows, intakeRows] = await Promise.all([
    gateway.selectWhere(
      "study_runs",
      { user_id: userId },
      { orderBy: "updated_at", ascending: false },
    ),
    gateway.selectWhere(
      "intake_runs",
      { user_id: userId },
      { orderBy: "updated_at", ascending: false },
    ),
  ]);

  const studyRuns: StudyRunWorkspaceRef[] = studyRows.map((row) => ({
    caseId: text(row, "case_id"),
    studyRunId: text(row, "id"),
    intakeRunId: nullableText(row, "intake_run_id"),
    status: text(row, "status") as StudyRunStatus,
    updatedAt: nullableText(row, "updated_at") ?? text(row, "started_at"),
  }));

  const intakeRuns: IntakeRunWorkspaceRef[] = intakeRows.map((row) => ({
    caseId: text(row, "case_id"),
    intakeRunId: text(row, "id"),
    updatedAt: nullableText(row, "updated_at") ?? text(row, "started_at"),
  }));

  return { studyRuns, intakeRuns };
}

export async function listOwnedHivesForSession(): Promise<OwnedHiveListResponse> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = await createAuthenticatedHiveGateway();
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const rows = await cases.listByUserId(sessionUserId);
  const caseIds = rows.map((row) => row.id);
  const { studyRuns, intakeRuns } = await loadWorkspaceRefsForUser(gateway, sessionUserId);
  const workspaces = indexOwnedHiveWorkspacesByCaseId({ caseIds, studyRuns, intakeRuns });
  return {
    cases: rows.map((row) => toSummary(row, workspaces.get(row.id)!)),
  };
}

export async function getOwnedHiveForSession(caseId: string): Promise<OwnedHiveDetailResponse | null> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = await createAuthenticatedHiveGateway();
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const record = await cases.getById(sessionUserId, caseId.trim());
  if (!record) {
    return null;
  }
  const { studyRuns, intakeRuns } = await loadWorkspaceRefsForUser(gateway, sessionUserId);
  const workspaces = indexOwnedHiveWorkspacesByCaseId({
    caseIds: [record.id],
    studyRuns,
    intakeRuns,
  });
  return toSummary(record, workspaces.get(record.id)!);
}

export { UnauthenticatedError };
