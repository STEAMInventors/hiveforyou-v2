import { L001_QUALIFICATION_SOURCE_SHA256 } from "@hiveforyou/core/study";

import { TrustedDocumentPagesError } from "./load-trusted-document-pages.js";
import type { RegisteredQualificationDocument } from "./load-trusted-document-pages.js";

export const L001_EXPECTED_DOCUMENT_COUNT = L001_QUALIFICATION_SOURCE_SHA256.length;

export type DocumentLoadOperation =
  | "STORAGE_DOWNLOAD"
  | "CACHE_PAYLOAD_ASSERT"
  | "BIND_SOURCE_DOCUMENT_ID"
  | "L001_FILENAME_MAP";

export type DocumentLoadErrorCategory =
  | "storage"
  | "missing_object"
  | "parse"
  | "metadata"
  | "sha_mismatch"
  | "extractor_mismatch"
  | "bind"
  | "filesystem"
  | "untyped";

export type DocumentLoadSummary = {
  registeredDocumentCount: number;
  expectedDocumentCount: number;
  allEightRegistered: boolean;
};

export type DocumentLoadFailureDiagnostic = DocumentLoadSummary & {
  operation: DocumentLoadOperation;
  errorCategory: DocumentLoadErrorCategory;
  trustedPagesCode?: string;
  sourceDocumentId?: string;
  documentIndex?: number;
  bundlesLoadedBeforeFailure: number;
  untypedErrorName?: string;
};

export type DocumentLoadDiagnosticAnchor = {
  studyRunId: string;
  attemptId: string;
  summary: DocumentLoadSummary;
};

let activeDocumentLoadAnchor: DocumentLoadDiagnosticAnchor | null = null;
let lastDocumentLoadFailureDiagnostic: DocumentLoadFailureDiagnostic | null = null;

export function summarizeRegisteredDocuments(
  documents: ReadonlyArray<RegisteredQualificationDocument>,
): DocumentLoadSummary {
  const registeredDocumentCount = documents.length;
  return {
    registeredDocumentCount,
    expectedDocumentCount: L001_EXPECTED_DOCUMENT_COUNT,
    allEightRegistered: registeredDocumentCount === L001_EXPECTED_DOCUMENT_COUNT,
  };
}

export function beginDocumentLoadDiagnostics(anchor: DocumentLoadDiagnosticAnchor): void {
  activeDocumentLoadAnchor = anchor;
  lastDocumentLoadFailureDiagnostic = null;
}

export function activeDocumentLoadSummaryFromAnchor(): DocumentLoadSummary | null {
  return activeDocumentLoadAnchor?.summary ?? null;
}

export function endDocumentLoadDiagnostics(): void {
  activeDocumentLoadAnchor = null;
}

export function takeLastDocumentLoadFailureDiagnostic(): DocumentLoadFailureDiagnostic | null {
  const diagnostic = lastDocumentLoadFailureDiagnostic;
  lastDocumentLoadFailureDiagnostic = null;
  return diagnostic;
}

export function peekLastDocumentLoadFailureDiagnostic(): DocumentLoadFailureDiagnostic | null {
  return lastDocumentLoadFailureDiagnostic;
}

function trustedPagesCodeToCategory(code: string): DocumentLoadErrorCategory {
  switch (code) {
    case "DOCUMENT_PAGES_CACHE_MISSING":
      return "missing_object";
    case "DOCUMENT_PAGES_CACHE_INVALID":
      return "parse";
    case "DOCUMENT_PAGES_EXTRACTOR_MISMATCH":
      return "extractor_mismatch";
    case "DOCUMENT_PAGES_HASH_MISMATCH":
      return "sha_mismatch";
    case "SOURCE_DOCUMENT_ID_REQUIRED":
      return "bind";
    default:
      return "storage";
  }
}

function trustedPagesCodeToOperation(code: string): DocumentLoadOperation {
  switch (code) {
    case "SOURCE_DOCUMENT_ID_REQUIRED":
      return "BIND_SOURCE_DOCUMENT_ID";
    default:
      return "CACHE_PAYLOAD_ASSERT";
  }
}

export function categorizeUntypedDocumentLoadError(error: unknown): {
  errorCategory: DocumentLoadErrorCategory;
  operation: DocumentLoadOperation;
  untypedErrorName?: string;
} {
  if (error instanceof Error) {
    const message = error.message;
    if (message === "L001_QUALIFICATION_SOURCE_DOCUMENT_FILENAME_MAP_INCOMPLETE") {
      return {
        errorCategory: "metadata",
        operation: "L001_FILENAME_MAP",
        untypedErrorName: error.name,
      };
    }
    if (message.startsWith("L001_QUALIFICATION_MANIFEST_MISSING:")) {
      return {
        errorCategory: "filesystem",
        operation: "L001_FILENAME_MAP",
        untypedErrorName: error.name,
      };
    }
    if (
      message.startsWith("L001_QUALIFICATION_MANIFEST_INVALID:") ||
      message.startsWith("L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:")
    ) {
      return {
        errorCategory: "metadata",
        operation: "L001_FILENAME_MAP",
        untypedErrorName: error.name,
      };
    }
    if (error.name === "SyntaxError") {
      return {
        errorCategory: "parse",
        operation: "L001_FILENAME_MAP",
        untypedErrorName: error.name,
      };
    }
    const errno = (error as NodeJS.ErrnoException).code;
    if (errno === "ENOENT" || errno === "EACCES" || errno === "EPERM") {
      return {
        errorCategory: "filesystem",
        operation: "L001_FILENAME_MAP",
        untypedErrorName: error.name,
      };
    }
    return {
      errorCategory: "untyped",
      operation: "L001_FILENAME_MAP",
      untypedErrorName: error.name,
    };
  }
  return {
    errorCategory: "untyped",
    operation: "L001_FILENAME_MAP",
  };
}

export function buildDocumentLoadFailureDiagnostic(input: {
  summary: DocumentLoadSummary;
  operation: DocumentLoadOperation;
  error: unknown;
  sourceDocumentId?: string;
  documentIndex?: number;
  bundlesLoadedBeforeFailure: number;
}): DocumentLoadFailureDiagnostic {
  if (input.error instanceof TrustedDocumentPagesError) {
    const operation =
      input.operation === "STORAGE_DOWNLOAD"
        ? "STORAGE_DOWNLOAD"
        : trustedPagesCodeToOperation(input.error.code);
    return {
      ...input.summary,
      operation,
      errorCategory:
        input.operation === "STORAGE_DOWNLOAD"
          ? "missing_object"
          : trustedPagesCodeToCategory(input.error.code),
      trustedPagesCode: input.error.code,
      sourceDocumentId: input.sourceDocumentId,
      documentIndex: input.documentIndex,
      bundlesLoadedBeforeFailure: input.bundlesLoadedBeforeFailure,
    };
  }
  const untyped = categorizeUntypedDocumentLoadError(input.error);
  return {
    ...input.summary,
    operation: input.operation,
    errorCategory:
      input.operation === "STORAGE_DOWNLOAD" ? "missing_object" : untyped.errorCategory,
    sourceDocumentId: input.sourceDocumentId,
    documentIndex: input.documentIndex,
    bundlesLoadedBeforeFailure: input.bundlesLoadedBeforeFailure,
    untypedErrorName: untyped.untypedErrorName,
  };
}

export function recordDocumentLoadFailureDiagnostic(diagnostic: DocumentLoadFailureDiagnostic): void {
  lastDocumentLoadFailureDiagnostic = diagnostic;
  if (!activeDocumentLoadAnchor) {
    return;
  }
  console.error("[agentic-reader-qualification] document load diagnostic", {
    studyRunId: activeDocumentLoadAnchor.studyRunId,
    attemptId: activeDocumentLoadAnchor.attemptId,
    operation: diagnostic.operation,
    errorCategory: diagnostic.errorCategory,
    ...(diagnostic.trustedPagesCode ? { trustedPagesCode: diagnostic.trustedPagesCode } : {}),
    ...(diagnostic.sourceDocumentId ? { sourceDocumentId: diagnostic.sourceDocumentId } : {}),
    ...(diagnostic.documentIndex !== undefined ? { documentIndex: diagnostic.documentIndex } : {}),
    registeredDocumentCount: diagnostic.registeredDocumentCount,
    expectedDocumentCount: diagnostic.expectedDocumentCount,
    allEightRegistered: diagnostic.allEightRegistered,
    bundlesLoadedBeforeFailure: diagnostic.bundlesLoadedBeforeFailure,
    ...(diagnostic.untypedErrorName ? { untypedErrorName: diagnostic.untypedErrorName } : {}),
  });
}
