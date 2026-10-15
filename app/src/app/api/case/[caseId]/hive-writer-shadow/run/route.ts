import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";
import type { CanonicalStudyReportAudience } from "@hiveforyou/shared/canonical-study-report-projection";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { CanonicalStudyArtifactsNotFoundError } from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { runHiveWriterShadowForSession } from "@/lib/hive-writer/hive-writer-shadow-service-server";

type RouteContext = { params: Promise<{ caseId: string }> };

function parseAudience(value: string | undefined): CanonicalStudyReportAudience | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "customer" || normalized === "pro") {
    return normalized;
  }
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  let studyRunId: string | undefined;
  let audience: CanonicalStudyReportAudience | null = null;
  try {
    const body = (await request.json()) as { studyRunId?: string; audience?: string };
    studyRunId = body.studyRunId?.trim();
    audience = parseAudience(body.audience);
  } catch {
    studyRunId = undefined;
  }

  if (!studyRunId) {
    return NextResponse.json(
      { error: "STUDY_RUN_ID_REQUIRED", message: "studyRunId is required." },
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
    const diagnostic = await runHiveWriterShadowForSession({ caseId, studyRunId, audience });
    return NextResponse.json(diagnostic);
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
      { error: "WRITER_SHADOW_FAILED", message: "Hive Writer shadow run failed." },
      { status: 500 },
    );
  }
}
