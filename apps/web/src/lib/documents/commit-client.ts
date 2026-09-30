import { getOrCreateClientCaseId } from "@/lib/canonical-study/map-start-request";
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
    throw new Error("DOCUMENT_COMMIT_FAILED");
  }
  return (await response.json()) as CommitDocumentsResult;
}
