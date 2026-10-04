import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";
import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { CustomerDiscoveryAnswer } from "@hiveforyou/shared/discover";

import {
  CaseNotFoundError,
  runDiscoverFromRequest,
} from "@/lib/document-discovery/discover-service-server";
import { readServerEnv } from "@/lib/env/server-env";

export async function POST(request: Request) {
  try {
    readServerEnv();
  } catch {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED", message: "Server environment is incomplete." },
      { status: 500 },
    );
  }

  let body: {
    caseId?: string;
    sourceDocumentIds?: string[];
    discoverRunId?: string;
    customerAnswers?: CustomerDiscoveryAnswer[];
    caseCustomerContextIntake?: CaseCustomerContextIntake;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Invalid discover continue request." },
      { status: 400 },
    );
  }

  if (
    !body.caseId ||
    !body.discoverRunId ||
    !Array.isArray(body.sourceDocumentIds) ||
    !Array.isArray(body.customerAnswers)
  ) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "caseId, discoverRunId, sourceDocumentIds, and customerAnswers are required.",
      },
      { status: 400 },
    );
  }

  try {
    const outcome = await runDiscoverFromRequest({
      caseId: body.caseId,
      sourceDocumentIds: body.sourceDocumentIds,
      discoverRunId: body.discoverRunId,
      customerAnswers: body.customerAnswers,
      caseCustomerContextIntake: body.caseCustomerContextIntake,
    });
    if (process.env.NODE_ENV === "development") {
      console.info("[api/discover/continue] outcome", {
        discoverRunId: outcome.run.discoverRunId,
        status: outcome.run.status,
        phase: outcome.run.phase,
        hasDocumentDiscovery: Boolean(outcome.documentDiscovery),
        hasStructureMap: Boolean(outcome.structureMap),
        questionCount: outcome.discoveryQuestions?.length ?? 0,
        errorCode: outcome.run.errorCode,
      });
    }
    return NextResponse.json(outcome);
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
    const code = error instanceof Error ? error.message : "UNEXPECTED";
    const clientSafeCodes = new Set([
      "DISCOVER_RUN_NOT_FOUND",
      "MISSING_COLLECTION_PROPOSAL",
      "MISSING_DISCOVERY_PROPOSAL",
      "MISSING_SOURCE_DOCUMENTS",
      "OBJECTIVE_REQUIRED",
      "INTENDED_AUDIENCE_REQUIRED",
      "INTENDED_AUDIENCE_UNKNOWN_ROLE",
      "INTENDED_AUDIENCE_OTHER_TEXT_REQUIRED",
      "OBJECTIVE_PERSISTENCE_FAILED",
    ]);
    if (code.includes("domain_id") && code.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "OBJECTIVE_PERSISTENCE_FAILED",
          message:
            "Your answers could not be saved. Apply supabase/migrations/20260928170000_case_customer_context_domain.sql, then try again.",
        },
        { status: 400 },
      );
    }
    if (clientSafeCodes.has(code)) {
      return NextResponse.json(
        { error: code, message: "Discover continue could not be completed." },
        { status: 400 },
      );
    }
    if (process.env.NODE_ENV === "development" && error instanceof Error) {
      console.error("[api/discover/continue]", code, error.stack);
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Discover continue could not be completed." },
      { status: 500 },
    );
  }
}
