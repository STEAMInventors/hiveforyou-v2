import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import {
  generateProQuerySql,
  runProQuerySql,
  StudyRunNotFoundError,
} from "@/lib/case-summary/pro-query-service-server";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  let body: { studyRunId?: string; request?: string; sql?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.studyRunId?.trim()) {
    return NextResponse.json({ error: "STUDY_RUN_REQUIRED" }, { status: 400 });
  }
  const studyRunId = body.studyRunId.trim();

  try {
    if (typeof body.sql === "string" && body.sql.trim()) {
      const result = await runProQuerySql({ caseId, studyRunId, sql: body.sql });
      return NextResponse.json(result);
    }
    if (typeof body.request === "string" && body.request.trim()) {
      const result = await generateProQuerySql({ caseId, studyRunId, request: body.request.trim() });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "REQUEST_OR_SQL_REQUIRED" }, { status: 400 });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof CaseNotFoundError || error instanceof StudyRunNotFoundError) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ENGINE_UNAVAILABLE") {
      return NextResponse.json({ error: "ENGINE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ error: "UNEXPECTED" }, { status: 500 });
  }
}
