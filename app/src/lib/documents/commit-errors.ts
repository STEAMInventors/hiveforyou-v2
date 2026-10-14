export class DocumentCommitError extends Error {
  readonly code: "UNAUTHENTICATED" | "DOCUMENT_COMMIT_FAILED";

  constructor(code: "UNAUTHENTICATED" | "DOCUMENT_COMMIT_FAILED") {
    super(code);
    this.name = "DocumentCommitError";
    this.code = code;
  }
}

export const UPLOAD_SIGN_IN_MESSAGE = "Sign in with Google to upload your documents.";

export function isUnauthenticatedDocumentCommit(error: unknown): boolean {
  if (error instanceof DocumentCommitError) {
    return error.code === "UNAUTHENTICATED";
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if ((error as { code?: unknown }).code === "UNAUTHENTICATED") {
      return true;
    }
  }
  return error instanceof Error && error.message === "UNAUTHENTICATED";
}
