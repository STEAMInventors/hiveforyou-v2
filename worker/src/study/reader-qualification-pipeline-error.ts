import { AgenticReaderQualificationError } from "./ensure-agentic-reader-qualification-run.js";
import { TrustedDocumentPagesError } from "./load-trusted-document-pages.js";

export type QualificationPipelineStage =
  | "DOCUMENT_LOAD"
  | "ENGINE1_CONTEXT"
  | "REQUEST_BUILD"
  | "READER_HTTP";

const KNOWN_READER_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export function sanitizeReaderErrorCode(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !KNOWN_READER_ERROR_CODE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export class ReaderHttpInvocationError extends Error {
  readonly httpStatus: number;
  readonly readerErrorCode: string;

  constructor(httpStatus: number, readerErrorCode: string) {
    const safeCode = sanitizeReaderErrorCode(readerErrorCode) ?? "READER_HTTP_FAILED";
    super("Reader HTTP " + httpStatus + ": " + safeCode);
    this.name = "ReaderHttpInvocationError";
    this.httpStatus = httpStatus;
    this.readerErrorCode = safeCode;
  }
}

export type QualificationPipelineFailure = {
  code: string;
  httpStatus?: number;
  readerErrorCode?: string;
};

function stageFallbackCode(stage: QualificationPipelineStage): string {
  switch (stage) {
    case "DOCUMENT_LOAD":
      return "DOCUMENT_LOAD_FAILED";
    case "ENGINE1_CONTEXT":
      return "ENGINE1_CONTEXT_FAILED";
    case "REQUEST_BUILD":
      return "REQUEST_BUILD_FAILED";
    case "READER_HTTP":
      return "READER_HTTP_FAILED";
  }
}

function parseLegacyReaderHttpMessage(message: string): string | null {
  const match = message.match(/^READER_HTTP_FAILED:([A-Z][A-Z0-9_]{0,63})$/);
  if (!match?.[1]) {
    return null;
  }
  return match[1];
}

export function resolveQualificationPipelineFailure(
  error: unknown,
  stage: QualificationPipelineStage,
): QualificationPipelineFailure {
  if (error instanceof TrustedDocumentPagesError) {
    return { code: error.code };
  }
  if (error instanceof AgenticReaderQualificationError) {
    return { code: error.code };
  }
  if (error instanceof ReaderHttpInvocationError) {
    const readerErrorCode = error.readerErrorCode;
    return {
      code: readerErrorCode === "READER_HTTP_FAILED" ? "READER_HTTP_FAILED" : readerErrorCode,
      httpStatus: error.httpStatus,
      readerErrorCode,
    };
  }
  if (error instanceof Error) {
    const fromMessage = parseLegacyReaderHttpMessage(error.message);
    if (fromMessage) {
      return {
        code: fromMessage,
        readerErrorCode: fromMessage,
      };
    }
  }
  return { code: stageFallbackCode(stage) };
}

export function logQualificationPipelineFailure(input: {
  studyRunId: string;
  attemptId: string;
  stage: QualificationPipelineStage;
  failure: QualificationPipelineFailure;
}): void {
  console.error("[agentic-reader-qualification] pipeline failure", {
    studyRunId: input.studyRunId,
    attemptId: input.attemptId,
    stage: input.stage,
    errorCode: input.failure.code,
    ...(input.failure.httpStatus !== undefined ? { httpStatus: input.failure.httpStatus } : {}),
    ...(input.failure.readerErrorCode ? { readerErrorCode: input.failure.readerErrorCode } : {}),
  });
}
