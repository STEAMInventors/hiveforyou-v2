import { getOrCreateClientCaseId } from "@/lib/canonical-study/map-start-request";
import { DocumentCommitError } from "@/lib/documents/commit-errors";
import type { StagedDocument } from "@/lib/staged-documents";

export type CommitDocumentsResult = {
  caseId: string;
  documents: Array<{
    stagedDocumentId: string;
    sourceDocumentId: string;
  }>;
};

export async function commitStagedDocuments(
  documents: StagedDocument[],
): Promise<CommitDocumentsResult> {
  const form = new FormData();
  form.set("caseId", getOrCreateClientCaseId());
  for (const document of documents) {
    form.append("file", document.file, document.file.name);
    form.append("stagedDocumentId", document.id);
  }
  const response = await fetch("/api/documents/commit", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new DocumentCommitError(await commitFailureCode(response));
  }
  return (await response.json()) as CommitDocumentsResult;
}

async function commitFailureCode(
  response: Response,
): Promise<DocumentCommitError["code"]> {
  if (response.status === 401) {
    return "UNAUTHENTICATED";
  }
  const body = await response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error?: unknown }).error === "UNAUTHENTICATED"
  ) {
    return "UNAUTHENTICATED";
  }
  return "DOCUMENT_COMMIT_FAILED";
}
