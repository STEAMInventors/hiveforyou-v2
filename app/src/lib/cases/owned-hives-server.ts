import "server-only";

import { requireSessionUserId, UnauthenticatedError } from "@hiveforyou/core";
import type { OwnedHiveDetailResponse, OwnedHiveListResponse } from "@hiveforyou/shared/cases";

import { SupabaseCaseRepository } from "@/lib/persistence/supabase-repositories";
import { createAuthenticatedHiveGateway, getAuthenticatedUserId } from "@/lib/supabase/server";

function toSummary(record: {
  id: string;
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
}): OwnedHiveDetailResponse {
  return {
    caseId: record.id,
    domainId: record.domainId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listOwnedHivesForSession(): Promise<OwnedHiveListResponse> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = await createAuthenticatedHiveGateway();
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const rows = await cases.listByUserId(sessionUserId);
  return { cases: rows.map(toSummary) };
}

export async function getOwnedHiveForSession(caseId: string): Promise<OwnedHiveDetailResponse | null> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = await createAuthenticatedHiveGateway();
  const cases = new SupabaseCaseRepository(gateway, sessionUserId);
  const record = await cases.getById(sessionUserId, caseId.trim());
  return record ? toSummary(record) : null;
}

export { UnauthenticatedError };
