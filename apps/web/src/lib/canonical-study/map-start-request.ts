import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";
import type { StagedDocument } from "@/lib/staged-documents";
import type { QuestionSet, QuestionsAnswerSnapshot } from "@/lib/questions/types";

const CLIENT_CASE_ID_KEY = "hive-client-case-id";

export function rememberClientCaseId(caseId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(CLIENT_CASE_ID_KEY, caseId);
}

export function getOrCreateClientCaseId(): string {
  if (typeof window === "undefined") {
    return "case-ssr-placeholder";
  }
  const existing = window.sessionStorage.getItem(CLIENT_CASE_ID_KEY);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(CLIENT_CASE_ID_KEY, created);
  return created;
}

/** Maps UI state to StartCanonicalStudyRequest — core freezes CanonicalStudyContext. */
export function mapToStartCanonicalStudyRequest(input: {
  caseId: string;
  stagedDocuments: StagedDocument[];
  discovery: DocumentDiscoveryResult;
  discoveryRunId?: string;
  questionSet: QuestionSet;
  answerSnapshot: QuestionsAnswerSnapshot;
}): StartCanonicalStudyRequest {
  const discoveryDocByStagedId = new Map(
    input.discovery.documents
      .filter((d) => d.stagedDocumentId)
      .map((d) => [d.stagedDocumentId!, d.id]),
  );

  return {
    caseId: input.caseId,
    discoveryRunId: input.discoveryRunId,
    sourceDocuments: input.stagedDocuments.map((doc) => ({
      stagedDocumentId: doc.id,
      discoveryDocumentId: discoveryDocByStagedId.get(doc.id),
      originalFilename: doc.file.name,
      sizeBytes: doc.file.size,
      mimeType: doc.file.type || undefined,
    })),
    engine1Result: structuredClone(input.discovery),
    questionSet: {
      id: input.questionSet.id,
      questions: input.questionSet.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        required: q.required,
        answerKind: q.answerKind,
        affectsCanonicalTruth: q.affectsCanonicalTruth,
        affectsAnalysis: q.affectsAnalysis,
        affectsProjection: q.affectsProjection,
        questionKey: q.questionKey,
        questionType: q.type,
        wordingVersion: q.wordingVersion,
        triggerType: q.triggerType,
        triggerKey: q.triggerKey,
        triggerMetadata: q.triggerMetadata,
      })),
    },
    answerSnapshot: structuredClone(input.answerSnapshot),
  };
}
