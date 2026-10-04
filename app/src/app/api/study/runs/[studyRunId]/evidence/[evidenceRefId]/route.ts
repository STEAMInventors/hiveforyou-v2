import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import {
  EvidenceRefNotFoundError,
  StudyRunNotFoundError,
  resolveEvidenceTraceForStudyRun,
} from "@/lib/evidence/evidence-trace-service-server";

type RouteContext = { params: Promise<{ studyRunId: string; evidenceRefId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { studyRunId, evidenceRefId } = await context.params;

  try {
    const trace = await resolveEvidenceTraceForStudyRun({ studyRunId, evidenceRefId });
    return NextResponse.json({ evidence: trace });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json(
        { error: "UNAUTHENTICATED", message: "Sign in is required." },
        { status: 401 },
      );
    }
    if (error instanceof CaseNotFoundError) {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "You do not have access to this study." },
        { status: 403 },
      );
    }
    if (error instanceof StudyRunNotFoundError) {
      return NextResponse.json(
        { error: "STUDY_RUN_NOT_FOUND", message: "Study run was not found." },
        { status: 404 },
      );
    }
    if (error instanceof EvidenceRefNotFoundError) {
      return NextResponse.json(
        { error: "EVIDENCE_REF_NOT_FOUND", message: "Evidence reference was not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not resolve evidence trace." },
      { status: 500 },
    );
  }
}
