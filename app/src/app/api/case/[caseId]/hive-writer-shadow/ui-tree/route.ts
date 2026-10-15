import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { CanonicalStudyArtifactsNotFoundError } from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { logRouteUnexpectedError } from "@/lib/log-route-unexpected-error";
import { loadWriterHiveUiTreePreviewForSession } from "@/lib/hive-writer/hive-writer-shadow-service-server";

const ROUTE_NAME = "api/case/hive-writer-shadow/ui-tree";

type RouteContext = { params: Promise<{ caseId: string }> };

function parseAudience(value: string | null): CanonicalStudyReportAudience | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "customer" || normalized === "pro") {
    return normalized;
  }
  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const url = new URL(request.url);
  const studyRunId = url.searchParams.get("studyRunId")?.trim();
  const audience = parseAudience(url.searchParams.get("audience"));

  if (!studyRunId) {
    return NextResponse.json(
      { error: "STUDY_RUN_ID_REQUIRED", message: "studyRunId query parameter is required." },
      { status: 400 },
    );
  }
  if (!audience) {
    return NextResponse.json(
      { error: "AUDIENCE_REQUIRED", message: "audience must be customer or pro." },
      { status: 400 },
    );
  }

  try {
    const payload = await loadWriterHiveUiTreePreviewForSession({
      caseId,
      studyRunId,
      audience,
    });
    return NextResponse.json(payload);
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
    logRouteUnexpectedError(ROUTE_NAME, error, { studyRunId });
    return NextResponse.json(
      { error: "WRITER_UI_TREE_FAILED", message: "Could not resolve Writer UI tree preview." },
      { status: 500 },
    );
  }
}
