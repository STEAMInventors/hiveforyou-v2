import "server-only";

import { NextResponse } from "next/server";

import {
  isUuid,
  UnauthenticatedError,
  type CaseRecord,
} from "@hiveforyou/core";

import {
  assertAuthBypassDisabledInProduction,
  AuthBypassRefusedInProductionError,
  isHiveAdminUserId,
} from "@/lib/preview/preview-gate";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import { SupabaseCaseRepository } from "@/lib/persistence/supabase-repositories";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
};

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class CaseAccessNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";

  constructor(message = "Case was not found.") {
    super(message);
    this.name = "CaseAccessNotFoundError";
  }
}

export async function requireUser(_request: Request): Promise<{ user: SessionUser }> {
  assertAuthBypassDisabledInProduction();
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new UnauthenticatedError();
  }
  return { user: { id: userId } };
}

export async function requireAdmin(_request: Request): Promise<{ user: SessionUser }> {
  const { user } = await requireUser(_request);
  if (!isHiveAdminUserId(user.id)) {
    throw new ForbiddenError("Admin access is required.");
  }
  return { user };
}

export async function requireCaseAccess(
  _request: Request,
  caseId: string,
): Promise<{ user: SessionUser; case: CaseRecord }> {
  const trimmedCaseId = caseId.trim();
  if (!isUuid(trimmedCaseId)) {
    throw new CaseAccessNotFoundError();
  }

  const { user } = await requireUser(_request);
  const sessionClient = await createServerSupabaseClient();
  const sessionGateway = createSupabaseHiveGateway(sessionClient);
  const ownedCase = await new SupabaseCaseRepository(sessionGateway, user.id).getById(
    user.id,
    trimmedCaseId,
  );
  if (ownedCase) {
    return { user, case: ownedCase };
  }

  const adminGateway = createSupabaseHiveGateway(createAdminSupabaseClient());
  const rows = await adminGateway.selectWhere("cases", { id: trimmedCaseId }, { limit: 1 });
  if (!rows[0]) {
    throw new CaseAccessNotFoundError();
  }
  throw new ForbiddenError("You do not have access to this case.");
}

const PAGE_ACCESS_REQUEST = new Request("http://localhost/internal/page-access");

export async function ensureDebugCasePageAccess(caseId: string): Promise<void> {
  const { notFound, redirect } = await import("next/navigation");
  try {
    await requireAdmin(PAGE_ACCESS_REQUEST);
    await requireCaseAccess(PAGE_ACCESS_REQUEST, caseId);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/");
    }
    if (error instanceof ForbiddenError) {
      notFound();
    }
    if (error instanceof CaseAccessNotFoundError) {
      notFound();
    }
    throw error;
  }
}

export function jsonFromAccessError(error: unknown): NextResponse | null {
  if (error instanceof AuthBypassRefusedInProductionError) {
    return NextResponse.json(
      { error: "MISCONFIGURED", message: "Authentication is misconfigured for production." },
      { status: 503 },
    );
  }
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in is required." },
      { status: 401 },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: error.message },
      { status: 403 },
    );
  }
  if (error instanceof CaseAccessNotFoundError) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: error.message },
      { status: 404 },
    );
  }
  return null;
}
