import { NextResponse } from "next/server";

import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";
import {
  CaseNotFoundError,
  startCanonicalStudyFromRequest,
} from "@/lib/canonical-study/study-service-server";
import { UnauthenticatedError, UnknownPromptVersionError } from "@hiveforyou/core";

import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

export async function POST(request: Request) {
  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  let body: StartCanonicalStudyRequest & { userId?: string };
  try {
    body = (await request.json()) as StartCanonicalStudyRequest & { userId?: string };
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid study request." },
      { status: 400 },
    );
  }

  try {
    const outcome = await startCanonicalStudyFromRequest(body);
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof CaseNotFoundError) {
      return NextResponse.json(
        { error: "CASE_NOT_FOUND", message: "Case was not found." },
        { status: 404 },
      );
    }
    if (error instanceof UnknownPromptVersionError) {
      return NextResponse.json(
        { error: "UNKNOWN_PROMPT_VERSION", message: "Prompt version is not available." },
        { status: 500 },
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("[api/study/run] UNEXPECTED", error);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Canonical study could not be started." },
      { status: 500 },
    );
  }
}
