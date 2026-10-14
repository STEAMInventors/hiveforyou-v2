import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { denyUnlessHiveDebugRoutesEnabled } from "@/lib/preview/hive-debug-server";
import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import {
  CanonicalStudyArtifactsNotFoundError,
  loadDeterministicCanonicalStudyArtifact,
} from "@/lib/canonical-debug/run-deterministic-canonical-study-server";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const disabled = denyUnlessHiveDebugRoutesEnabled();
  if (disabled) {
    return disabled;
  }

  const { caseId } = await context.params;
  const url = new URL(request.url);
  const studyRunId = url.searchParams.get("studyRunId")?.trim();
  if (!studyRunId) {
    return NextResponse.json(
      { error: "STUDY_RUN_ID_REQUIRED", message: "studyRunId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const artifact = await loadDeterministicCanonicalStudyArtifact({ caseId, studyRunId });
    return NextResponse.json(artifact);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof CaseNotFoundError || error instanceof StudyRunNotFoundError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Resource was not found." },
        { status: 404 },
      );
    }
    if (error instanceof CanonicalStudyArtifactsNotFoundError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not load canonical study debug artifact." },
      { status: 500 },
    );
  }
}
