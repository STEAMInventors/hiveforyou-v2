import { NextResponse } from "next/server";

import { readServerEnv } from "@/lib/env/server-env";
import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { IntakeCaseNotFoundError } from "@/lib/intake/intake-service-server";
import {
  IntakeStudyNotReadyError,
  startIntakeCanonicalStudyFromRun,
} from "@/lib/intake/intake-study-service-server";
import { UnauthenticatedError, UnknownPromptVersionError } from "@hiveforyou/core";

type RouteContext = {
  params: Promise<{ intakeRunId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    readServerEnv();
  } catch {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED", message: "Server environment is incomplete." },
      { status: 500 },
    );
  }

  const { intakeRunId } = await context.params;
  if (!intakeRunId?.trim()) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Intake run id is required." },
      { status: 400 },
    );
  }

  try {
    const outcome = await startIntakeCanonicalStudyFromRun(intakeRunId.trim());
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof IntakeCaseNotFoundError) {
      return NextResponse.json(
        { error: "INTAKE_NOT_FOUND", message: "Intake run was not found." },
        { status: 404 },
      );
    }
    if (error instanceof CaseNotFoundError) {
      return NextResponse.json(
        { error: "CASE_NOT_FOUND", message: "Case was not found." },
        { status: 404 },
      );
    }
    if (error instanceof IntakeStudyNotReadyError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof UnknownPromptVersionError) {
      return NextResponse.json(
        { error: "UNKNOWN_PROMPT_VERSION", message: "Prompt version is not available." },
        { status: 500 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/intake/study] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Canonical study could not be started from intake." },
      { status: 500 },
    );
  }
}
