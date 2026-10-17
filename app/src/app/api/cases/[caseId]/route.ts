import { NextResponse } from "next/server";

import { UnauthenticatedError, isUuid } from "@hiveforyou/core";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { getOwnedHiveForSession } from "@/lib/cases/owned-hives-server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  const { caseId } = await context.params;
  if (!isUuid(caseId.trim())) {
    return NextResponse.json(
      { error: "INVALID_CASE_ID", message: "Invalid Hive id." },
      { status: 400 },
    );
  }

  try {
    const hive = await getOwnedHiveForSession(caseId);
    if (!hive) {
      return NextResponse.json(
        { error: "CASE_NOT_FOUND", message: "Hive was not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(hive);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/cases/[caseId]] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not load this Hive." },
      { status: 500 },
    );
  }
}
