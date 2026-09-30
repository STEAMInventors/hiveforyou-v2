import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import type { QuestionsAnswerSnapshot } from "@hiveforyou/shared/questions";

import type { SourceDocumentRecord } from "./source-document-repository";
import { resolvePhysicalSourceDocuments } from "./resolve-physical-source-documents";
import { requireSessionUserId } from "./session-user";

export type AssemblePersistedStudyInput = {
  sessionUserId: string | null | undefined;
  /** Ignored. Present so callers can prove browser-supplied ids are not authoritative. */
  browserSuppliedUserId?: string | null;
  caseId: string;
  documents: SourceDocumentRecord[];
  clientSourceDocuments: StartCanonicalStudyRequest["sourceDocuments"];
  engine1Result: StartCanonicalStudyRequest["engine1Result"];
  questionSet: StartCanonicalStudyRequest["questionSet"];
  answerSnapshot: QuestionsAnswerSnapshot;
  answerSnapshotId: string;
  clientRequestId?: string;
};

/**
 * Builds the study request from persisted document metadata and the frozen answer snapshot.
 * File bytes are not copied into the request.
 */
export function assemblePersistedStudyRequest(
  input: AssemblePersistedStudyInput,
): StartCanonicalStudyRequest & { actorUserId: string } {
  const actorUserId = requireSessionUserId(input.sessionUserId);
  const clientById = new Map(
    input.clientSourceDocuments.map((doc) => [doc.stagedDocumentId, doc]),
  );
  const clientBySourceId = new Map(
    input.clientSourceDocuments
      .filter((doc) => doc.sourceDocumentId)
      .map((doc) => [doc.sourceDocumentId!, doc]),
  );

  const physicalDocuments = resolvePhysicalSourceDocuments({
    documents: input.documents,
    engine1Result: input.engine1Result,
    caseId: input.caseId,
    actorUserId,
  });

  const sourceDocuments = physicalDocuments.map((doc) => {
      const client =
        clientById.get(doc.id) ??
        (doc.clientStagedId ? clientById.get(doc.clientStagedId) : undefined) ??
        clientBySourceId.get(doc.id);
      return {
        stagedDocumentId: doc.id,
        discoveryDocumentId: client?.discoveryDocumentId,
        originalFilename: doc.originalFilename,
        sizeBytes: doc.sizeBytes,
        mimeType: doc.mimeType ?? undefined,
        sourceDocumentId: doc.id,
        sha256: doc.sha256,
        storageBucket: doc.storageBucket,
        storagePath: doc.storagePath,
      };
    });

  return {
    actorUserId,
    caseId: input.caseId,
    sourceDocuments,
    engine1Result: input.engine1Result,
    questionSet: input.questionSet,
    answerSnapshot: input.answerSnapshot,
    answerSnapshotId: input.answerSnapshotId,
    clientRequestId: input.clientRequestId,
  };
}
