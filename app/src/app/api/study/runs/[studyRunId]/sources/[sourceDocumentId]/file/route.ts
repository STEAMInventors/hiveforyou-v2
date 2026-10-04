import { NextResponse } from "next/server";

import { UnauthenticatedError } from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/evidence/evidence-trace-service-server";
import {
  loadSourceDocumentFileForStudyRun,
  SourceDocumentNotFoundError,
  SourceDocumentStorageError,
} from "@/lib/evidence/source-document-file-service-server";

type RouteContext = {
  params: Promise<{ studyRunId: string; sourceDocumentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { studyRunId, sourceDocumentId } = await context.params;
  const originalFilenameHint = new URL(request.url).searchParams.get("filename");

  try {
    const file = await loadSourceDocumentFileForStudyRun({
      studyRunId,
      sourceDocumentId,
      originalFilenameHint,
    });
    return new NextResponse(Buffer.from(file.bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
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
        { error: "ACCESS_DENIED", message: "You do not have access to this study." },
        { status: 403 },
      );
    }
    if (error instanceof StudyRunNotFoundError || error instanceof SourceDocumentNotFoundError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Document was not found." },
        { status: 404 },
      );
    }
    if (error instanceof SourceDocumentStorageError) {
      return NextResponse.json(
        { error: "STORAGE_UNAVAILABLE", message: "Document file could not be read from storage." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "UNEXPECTED", message: "Could not open document." },
      { status: 500 },
    );
  }
}
