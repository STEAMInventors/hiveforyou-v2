import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { loadCaseViewBundle } from "@/lib/case/case-bundle-service-server";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("intelligenceVersion");
  const intelligenceVersion = versionParam ? Number(versionParam) : undefined;

  if (versionParam && Number.isNaN(intelligenceVersion)) {
    return NextResponse.json(
      { error: "INVALID_VERSION", message: "intelligenceVersion must be a number." },
      { status: 400 },
    );
  }

  try {
    const bundle = await loadCaseViewBundle({ caseId, intelligenceVersion });
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
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not load case view." },
      { status: 500 },
    );
  }
}
