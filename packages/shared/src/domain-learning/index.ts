export type QuestionTriggerType =
  | "MISSING_EXPECTED_DOCUMENT"
  | "AMBIGUOUS_DOCUMENT_IDENTITY"
  | "AMBIGUOUS_RELATIONSHIP"
  | "CHRONOLOGY_GAP"
  | "MISSING_CONTEXT"
  | "ANALYSIS_INTENT"
  | "PACK_REQUIRED_CLARIFICATION"
  | "OTHER";

export type DomainLearningObservationType =
  | "DOCUMENT_PRESENT"
  | "DOCUMENT_EXPECTED_MISSING"
  | "DOCUMENT_UNAVAILABLE"
  | "DOCUMENT_NOT_APPLICABLE"
  | "AMBIGUITY_FOUND"
  | "QUESTION_ASKED"
  | "QUESTION_ANSWERED"
  | "AMBIGUITY_RESOLVED"
  | "VALIDATED_CLAIM_CREATED"
  | "CLAIM_REJECTED"
  | "CONFLICT_FOUND"
  | "HUMAN_ADJUDICATION_REQUIRED"
  | "STUDY_SUCCEEDED"
  | "STUDY_FAILED";

export type DomainLearningCandidateStatus =
  | "PROPOSED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "CERTIFIED";

export type IntelligenceSourceClass =
  | "DOCUMENT_EVIDENCE"
  | "USER_CONTEXT"
  | "USER_ASSERTION"
  | "ANALYSIS_INTENT"
  | "DERIVED";

export const DOMAIN_LEARNING_OBSERVATION_SCHEMA_VERSION = "1" as const;

export type DomainLearningObservation = {
  id: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  caseId: string;
  studyRunId: string;
  observationType: DomainLearningObservationType;
  subjectKey: string;
  observationJson: Record<string, unknown>;
  observationSchemaVersion: typeof DOMAIN_LEARNING_OBSERVATION_SCHEMA_VERSION;
  questionId?: string | null;
  answerId?: string | null;
  sourceDocumentId?: string | null;
  createdAt: string;
};

export type DomainLearningCandidate = {
  id: string;
  domainId: string;
  candidateType: string;
  subjectKey: string;
  proposedLearning: Record<string, unknown>;
  supportingObservationCount: number;
  status: DomainLearningCandidateStatus;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  certifiedDomainPackVersion?: string | null;
  sourceDomainPackId?: string | null;
  sourceDomainPackVersion?: string | null;
  supportingObservationIds: string[];
};

export type IntelligenceLineageRecord = {
  id: string;
  userId: string;
  caseId: string;
  studyRunId: string;
  intelligenceItemType: string;
  intelligenceItemId: string;
  sourceClass: IntelligenceSourceClass;
  /** Opaque Structure Map logical document id — not a UUID. */
  logicalDocumentId?: string | null;
  sourceDocumentId?: string | null;
  questionId?: string | null;
  answerId?: string | null;
  parentIntelligenceItemId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CaseQuestionRecord = {
  id: string;
  userId: string;
  caseId: string;
  studyRunId?: string | null;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  questionSetVersion: string;
  questionKey: string;
  questionType: string;
  wordingVersion: string;
  questionText: string;
  required: boolean;
  triggerType: QuestionTriggerType;
  triggerKey?: string | null;
  triggerMetadata: Record<string, unknown>;
  affectsCanonicalTruth: boolean;
  affectsAnalysis: boolean;
  affectsProjection: boolean;
  createdAt: string;
  /** Client/question-set id for correlation within a question set snapshot. */
  clientQuestionId: string;
};

export type CaseQuestionAnswerRecord = {
  id: string;
  questionId: string;
  userId: string;
  caseId: string;
  answerVersion: number;
  answerValue: Record<string, unknown>;
  disposition?: string | null;
  supersedesAnswerId?: string | null;
  answeredAt: string;
  createdAt: string;
};
