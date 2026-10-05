import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import {
  IntakeCaseNotFoundError,
  IntakeDocumentNotFoundError,
  startIntakeFromRequest,
  type StartIntakeBody,
} from "@/lib/intake/intake-service-server";
import { isInngestIntakePipeline } from "@/lib/intake/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  let body: StartIntakeBody;
  try {
    body = (await request.json()) as StartIntakeBody;
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid intake request." },
      { status: 400 },
    );
  }

  try {
    const opened = await startIntakeFromRequest(body);
    if (!isInngestIntakePipeline()) {
      void opened.begin().catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.error("[api/intake/run] background intake failed", error);
        }
      });
    }
    return NextResponse.json({
      intakeRunId: opened.run.id,
      status: opened.run.status,
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof IntakeCaseNotFoundError) {
      return NextResponse.json(
        { error: "CASE_NOT_FOUND", message: "Case was not found." },
        { status: 404 },
      );
    }
    if (error instanceof IntakeDocumentNotFoundError) {
      return NextResponse.json(
        { error: "DOCUMENT_NOT_FOUND", message: "A document was not found." },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "INTAKE_REQUEST_INVALID") {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Invalid intake request." },
        { status: 400 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/intake/run] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Document understanding could not be started." },
      { status: 500 },
    );
  }
}
