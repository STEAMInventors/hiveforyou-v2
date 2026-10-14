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
    const filename = `raw-extraction-${studyRunId}.json`;
    const body = JSON.stringify(bundle.downloadPayload, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof CaseNotFoundError || error instanceof StudyRunNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Resource was not found." }, { status: 404 });
    }
    if (error instanceof RawExtractionNotFoundError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not download raw extraction artifact." },
      { status: 500 },
    );
  }
}
