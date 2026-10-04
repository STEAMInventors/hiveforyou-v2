import { NextResponse } from "next/server";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import {
  loadCaseMapViewBundle,
  StudyRunNotFoundError,
} from "@/lib/case-map/case-map-bundle-service-server";
import { UnauthenticatedError } from "@hiveforyou/core";

type RouteContext = { params: Promise<{ studyRunId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { studyRunId } = await context.params;
  if (!studyRunId?.trim()) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const bundle = await loadCaseMapViewBundle(studyRunId.trim());
    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof StudyRunNotFoundError) {
      return NextResponse.json({ error: "STUDY_RUN_NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof CaseNotFoundError) {
      return NextResponse.json({ error: "CASE_NOT_FOUND" }, { status: 404 });
    }
    console.error("[api/study/runs/map] GET failed", {
      studyRunId: studyRunId.trim(),
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "UNEXPECTED" }, { status: 500 });
  }
}
