import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import {
  PackNotAvailableError,
  SourcePagesUnavailableError,
  runDeterministicCanonicalStudy,
} from "@/lib/canonical-debug/run-deterministic-canonical-study-server";
import { RawExtractionNotFoundError } from "@/lib/extraction-debug/raw-extraction-inspector-server";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  let studyRunId: string | undefined;
  try {
    const body = (await request.json()) as { studyRunId?: string };
    studyRunId = body.studyRunId?.trim();
  } catch {
    studyRunId = undefined;
  }

  if (!studyRunId) {
    return NextResponse.json(
      { error: "STUDY_RUN_ID_REQUIRED", message: "studyRunId is required." },
      { status: 400 },
    );
  }

  try {
    const result = await runDeterministicCanonicalStudy({ caseId, studyRunId });
    return NextResponse.json({
      studyRunId: result.studyRunId,
      attemptId: result.attemptId,
      foundationObjectKey: result.foundationObjectKey,
      artifactObjectKey: result.artifactObjectKey,
      counts: result.artifact.counts,
      contentSha256: result.artifact.contentSha256,
      packApprovalLabel: result.artifact.packApprovalLabel,
      customerProReportsPermitted: result.artifact.customerProReportsPermitted,
    });
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
    if (error instanceof PackNotAvailableError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 409 },
      );
    }
    if (error instanceof SourcePagesUnavailableError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          affectedDocumentIds: [...error.affectedDocumentIds],
        },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "CANONICAL_STUDY_ARTIFACT_CONFLICT") {
      return NextResponse.json(
        {
          error: "CANONICAL_STUDY_ARTIFACT_CONFLICT",
          message: "Canonical study artifacts already exist with different content.",
        },
        { status: 409 },
      );
    }
    console.error("[api/case/canonical-study/run] UNEXPECTED", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "non-Error throw",
    });
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not run deterministic canonical study." },
      { status: 500 },
    );
  }
}
