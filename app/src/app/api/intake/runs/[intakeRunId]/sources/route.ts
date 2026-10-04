import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { readServerEnv } from "@/lib/env/server-env";
import {
  appendSourcesToIntakeRun,
  IntakeDocumentNotFoundError,
} from "@/lib/intake/intake-service-server";
import { isInngestIntakePipeline } from "@/lib/intake/pipeline";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ intakeRunId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    readServerEnv();
  } catch {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED", message: "Server environment is incomplete." },
      { status: 500 },
    );
  }

  const { intakeRunId } = await context.params;
  let body: { sourceDocumentIds?: string[] };
  try {
    body = (await request.json()) as { sourceDocumentIds?: string[] };
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  const sourceDocumentIds = (body.sourceDocumentIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (!intakeRunId.trim() || sourceDocumentIds.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  try {
    const opened = await appendSourcesToIntakeRun(intakeRunId, sourceDocumentIds);
    if (!isInngestIntakePipeline()) {
      void opened.begin().catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.error("[api/intake/runs/sources] background intake failed", error);
        }
      });
    }
    return NextResponse.json({ intakeRunId: opened.run.id, status: opened.run.status });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof IntakeDocumentNotFoundError) {
      return NextResponse.json(
        { error: "DOCUMENT_NOT_FOUND", message: "A document was not found." },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "INTAKE_RUN_NOT_FOUND") {
      return NextResponse.json(
        { error: "INTAKE_NOT_FOUND", message: "That reading could not be found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Documents could not be added." },
      { status: 500 },
    );
  }
}
