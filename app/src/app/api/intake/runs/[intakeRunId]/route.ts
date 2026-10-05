import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { readIntakeEvidenceWorkspaceView } from "@/lib/intake/intake-service-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ intakeRunId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  const { intakeRunId } = await context.params;
  if (!intakeRunId.trim()) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  try {
    const view = await readIntakeEvidenceWorkspaceView(intakeRunId);
    if (!view) {
      return NextResponse.json(
        { error: "INTAKE_NOT_FOUND", message: "That reading could not be found." },
        { status: 404 },
      );
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/intake/runs] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Document understanding could not be read." },
      { status: 500 },
    );
  }
}
