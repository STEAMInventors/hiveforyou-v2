import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import { discardIntakeSourceFromRun } from "@/lib/intake/intake-service-server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ intakeRunId: string; sourceDocumentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  const { intakeRunId, sourceDocumentId } = await context.params;
  let body: { disposition?: string };
  try {
    body = (await request.json()) as { disposition?: string };
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  const disposition = body.disposition;
  if (
    !intakeRunId.trim() ||
    !sourceDocumentId.trim() ||
    (disposition !== "DISCARDED" && disposition !== "PRESENT")
  ) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  try {
    const view = await discardIntakeSourceFromRun(
      intakeRunId,
      sourceDocumentId,
      disposition,
    );
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
    if (error instanceof Error && error.message === "INTAKE_SOURCE_NOT_FOUND") {
      return NextResponse.json(
        { error: "DOCUMENT_NOT_FOUND", message: "A document was not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Document could not be updated." },
      { status: 500 },
    );
  }
}
