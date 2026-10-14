import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { denyUnlessHiveDebugRoutesEnabled } from "@/lib/preview/hive-debug-server";
import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import {
  RawExtractionNotFoundError,
  loadRawExtractionInspectorBundle,
} from "@/lib/extraction-debug/raw-extraction-inspector-server";

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
    const bundle = await loadRawExtractionInspectorBundle({ caseId, studyRunId });
    return NextResponse.json(bundle);
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
    if (error instanceof StudyRunNotFoundError) {
      return NextResponse.json(
        { error: "STUDY_RUN_NOT_FOUND", message: "Study run was not found for this case." },
        { status: 404 },
      );
    }
    if (error instanceof RawExtractionNotFoundError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    console.error("[api/case/raw-extraction] UNEXPECTED", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "non-Error throw",
    });
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not load raw extraction inspector data." },
      { status: 500 },
    );
  }
}
