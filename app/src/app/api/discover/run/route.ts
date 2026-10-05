import { NextResponse } from "next/server";

import {
  UnauthenticatedError,
  UnknownDiscoverPromptVersionError,
} from "@hiveforyou/core";

import {
  CaseNotFoundError,
  runDiscoverFromRequest,
} from "@/lib/document-discovery/discover-service-server";
import { serverMisconfiguredResponse } from "@/lib/env/server-misconfigured";
import { readServerEnv } from "@/lib/env/server-env";

export async function POST(request: Request) {
  console.log(
    "[api/discover/run] HIVE_DISCOVER_PROMPT_VERSION",
    process.env.HIVE_DISCOVER_PROMPT_VERSION,
  );

  try {
    readServerEnv();
  } catch {
    return serverMisconfiguredResponse();
  }

  let body: { caseId?: string; sourceDocumentIds?: string[] };
  try {
    body = (await request.json()) as { caseId?: string; sourceDocumentIds?: string[] };
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid discover request." },
      { status: 400 },
    );
  }

  if (!body.caseId || !Array.isArray(body.sourceDocumentIds)) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "caseId and sourceDocumentIds are required." },
      { status: 400 },
    );
  }

  try {
    const outcome = await runDiscoverFromRequest({
      caseId: body.caseId,
      sourceDocumentIds: body.sourceDocumentIds,
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[api/discover/run] outcome", {
        discoverRunId: outcome.run.discoverRunId,
        status: outcome.run.status,
        phase: outcome.run.phase,
        hasDocumentDiscovery: Boolean(outcome.documentDiscovery),
        questionCount: outcome.discoveryQuestions?.length ?? 0,
        errorCode: outcome.run.errorCode,
      });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("[api/discover/run] discover run failed", error);
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
    if (error instanceof UnknownDiscoverPromptVersionError) {
      return NextResponse.json(
        { error: "UNKNOWN_PROMPT_VERSION", message: "Prompt version is not available." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Document discovery could not be completed." },
      { status: 500 },
    );
  }
}
