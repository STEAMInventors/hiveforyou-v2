import { getOrCreateClientCaseId } from "@/lib/canonical-study/map-start-request";
import type { DocumentCommitOptions } from "@/lib/cases/cases-client";
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
  options?: DocumentCommitOptions,
): Promise<CommitDocumentsResult> {
  const form = new FormData();
  const caseId = options?.caseId ?? getOrCreateClientCaseId();
  form.set("caseId", caseId);
  if (options?.selectionIntent) {
    form.set("hiveSelectionIntent", options.selectionIntent);
  }
  for (const document of documents) {
    form.append("file", document.file, document.file.name);
    form.append("stagedDocumentId", document.id);
  }
  const response = await fetch("/api/documents/commit", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    let errorCode = "DOCUMENT_COMMIT_FAILED";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        errorCode = body.error;
      }
    } catch {
      errorCode = "DOCUMENT_COMMIT_FAILED";
    }
    throw new Error(errorCode);
  }
  return (await response.json()) as CommitDocumentsResult;
}
