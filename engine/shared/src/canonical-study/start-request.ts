import type { DocumentDiscoveryResult } from "../discovery";
import type { QuestionSetSnapshot, QuestionsAnswerSnapshot } from "../questions";

import type { StudySourceDocumentRef } from "./source-document";

/**
 * Web and other clients submit partial, trusted inputs only.
 * Core resolves domain pack, assigns run ids, freezes CanonicalStudyContext, and executes.
 */
export type StartCanonicalStudyRequest = {
  caseId: string;
  sourceDocuments: StudySourceDocumentRef[];
  /** Intake Evidence Workspace run that produced pack execution and logical documents. */
  intakeRunId?: string;
  /**
   * Server-only fingerprint of intake evidence + pack execution for idempotency.
   * Clients must not set this field.
   */
  intakeStudyMaterialFingerprint?: string;
  /** Persisted Engine 1 discover run when adaptive discovery completed. */
  discoveryRunId?: string;
  engine1Result: DocumentDiscoveryResult;
  questionSet: QuestionSetSnapshot;
  answerSnapshot: QuestionsAnswerSnapshot;
  /** Optional client correlation id — not used for idempotency. */
  clientRequestId?: string;
  /** Set by the server after the answer snapshot row is persisted. */
  answerSnapshotId?: string;
};
