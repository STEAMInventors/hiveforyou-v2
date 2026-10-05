import type {
  CaseQuestionAnswerRecord,
  CaseQuestionRecord,
  DomainLearningCandidate,
  DomainLearningObservation,
  IntelligenceLineageRecord,
} from "@hiveforyou/shared/domain-learning";
import type {
  CaseQuestionAnswerRepository,
  CaseQuestionRepository,
  DomainLearningCandidateRepository,
  DomainLearningObservationRepository,
  IntelligenceLineageRepository,
  StudyRunDocumentRepository,
  StudyRunQuestionAnswerRepository,
} from "@hiveforyou/core";
import { withSessionOwner } from "@hiveforyou/core";

import type { HiveGateway, HiveRow } from "./hive-gateway";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

function mapCaseQuestion(row: HiveRow): CaseQuestionRecord {
  const triggerMetadata = (row.trigger_metadata ?? {}) as Record<string, unknown>;
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    caseId: text(row, "case_id"),
    studyRunId: row.study_run_id ? text(row, "study_run_id") : null,
    domainId: text(row, "domain_id"),
    domainPackId: text(row, "domain_pack_id"),
    domainPackVersion: text(row, "domain_pack_version"),
    questionSetVersion: text(row, "question_set_version"),
    questionKey: text(row, "question_key"),
    questionType: text(row, "question_type"),
    wordingVersion: text(row, "wording_version"),
    questionText: text(row, "question_text"),
    required: Boolean(row.required),
    triggerType: text(row, "trigger_type") as CaseQuestionRecord["triggerType"],
    triggerKey: row.trigger_key == null ? null : String(row.trigger_key),
    triggerMetadata,
    affectsCanonicalTruth: Boolean(row.affects_canonical_truth),
    affectsAnalysis: Boolean(row.affects_analysis),
    affectsProjection: Boolean(row.affects_projection),
    createdAt: text(row, "created_at"),
    clientQuestionId: String(triggerMetadata.clientQuestionId ?? row.id),
  };
}

export class SupabaseCaseQuestionRepository implements CaseQuestionRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async findByCaseAndKey(
    caseId: string,
    questionSetVersion: string,
    questionKey: string,
    wordingVersion: string,
  ): Promise<CaseQuestionRecord | null> {
    const rows = await this.gateway.selectWhere(
      "case_questions",
      {
        user_id: this.userId,
        case_id: caseId,
        question_set_version: questionSetVersion,
        question_key: questionKey,
        wording_version: wordingVersion,
      },
      { limit: 1 },
    );
    return rows[0] ? mapCaseQuestion(rows[0]) : null;
  }

  async insert(question: CaseQuestionRecord): Promise<void> {
    await this.gateway.insert(
      "case_questions",
      withSessionOwner(this.userId, {
        id: question.id,
        user_id: question.userId,
        case_id: question.caseId,
        study_run_id: question.studyRunId ?? null,
        domain_id: question.domainId,
        domain_pack_id: question.domainPackId,
        domain_pack_version: question.domainPackVersion,
        question_set_version: question.questionSetVersion,
        question_key: question.questionKey,
        question_type: question.questionType,
        wording_version: question.wordingVersion,
        question_text: question.questionText,
        required: question.required,
        trigger_type: question.triggerType,
        trigger_key: question.triggerKey,
        trigger_metadata: question.triggerMetadata,
        affects_canonical_truth: question.affectsCanonicalTruth,
        affects_analysis: question.affectsAnalysis,
        affects_projection: question.affectsProjection,
        created_at: question.createdAt,
      }),
    );
  }

  async listByCase(caseId: string): Promise<CaseQuestionRecord[]> {
    const rows = await this.gateway.selectWhere("case_questions", {
      user_id: this.userId,
      case_id: caseId,
    });
    return rows.map(mapCaseQuestion);
  }
}

export class SupabaseCaseQuestionAnswerRepository implements CaseQuestionAnswerRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async getLatestVersion(questionId: string): Promise<CaseQuestionAnswerRecord | null> {
    const rows = await this.gateway.selectWhere(
      "case_question_answers",
      { user_id: this.userId, question_id: questionId },
      { orderBy: "answer_version", ascending: false, limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: text(row, "id"),
      questionId: text(row, "question_id"),
      userId: text(row, "user_id"),
      caseId: text(row, "case_id"),
      answerVersion: Number(row.answer_version),
      answerValue: row.answer_value as Record<string, unknown>,
      disposition: row.disposition == null ? null : String(row.disposition),
      supersedesAnswerId:
        row.supersedes_answer_id == null ? null : text(row, "supersedes_answer_id"),
      answeredAt: text(row, "answered_at"),
      createdAt: text(row, "created_at"),
    };
  }

  async insert(answer: CaseQuestionAnswerRecord): Promise<void> {
    await this.gateway.insert(
      "case_question_answers",
      withSessionOwner(this.userId, {
        id: answer.id,
        question_id: answer.questionId,
        user_id: answer.userId,
        case_id: answer.caseId,
        answer_version: answer.answerVersion,
        answer_value: answer.answerValue,
        disposition: answer.disposition,
        supersedes_answer_id: answer.supersedesAnswerId,
        answered_at: answer.answeredAt,
        created_at: answer.createdAt,
      }),
    );
  }

  async listByQuestion(questionId: string): Promise<CaseQuestionAnswerRecord[]> {
    const rows = await this.gateway.selectWhere(
      "case_question_answers",
      { user_id: this.userId, question_id: questionId },
      { orderBy: "answer_version", ascending: true },
    );
    return rows.map((row) => ({
      id: text(row, "id"),
      questionId: text(row, "question_id"),
      userId: text(row, "user_id"),
      caseId: text(row, "case_id"),
      answerVersion: Number(row.answer_version),
      answerValue: row.answer_value as Record<string, unknown>,
      disposition: row.disposition == null ? null : String(row.disposition),
      supersedesAnswerId:
        row.supersedes_answer_id == null ? null : text(row, "supersedes_answer_id"),
      answeredAt: text(row, "answered_at"),
      createdAt: text(row, "created_at"),
    }));
  }
}

export class SupabaseStudyRunQuestionAnswerRepository
  implements StudyRunQuestionAnswerRepository
{
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async bind(input: {
    studyRunId: string;
    questionId: string;
    answerId: string;
  }): Promise<void> {
    const existing = await this.listByStudyRun(input.studyRunId);
    if (
      existing.some(
        (row) => row.questionId === input.questionId && row.answerId === input.answerId,
      )
    ) {
      return;
    }
    await this.gateway.insert("study_run_question_answers", {
      study_run_id: input.studyRunId,
      question_id: input.questionId,
      answer_id: input.answerId,
      created_at: new Date().toISOString(),
    });
  }

  async listByStudyRun(studyRunId: string): Promise<
    { studyRunId: string; questionId: string; answerId: string }[]
  > {
    const rows = await this.gateway.selectWhere("study_run_question_answers", {
      study_run_id: studyRunId,
    });
    return rows.map((row) => ({
      studyRunId: text(row, "study_run_id"),
      questionId: text(row, "question_id"),
      answerId: text(row, "answer_id"),
    }));
  }
}

export class SupabaseStudyRunDocumentRepository implements StudyRunDocumentRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async snapshotExists(studyRunId: string): Promise<boolean> {
    const rows = await this.gateway.selectWhere(
      "study_run_documents",
      { study_run_id: studyRunId, user_id: this.userId },
      { limit: 1 },
    );
    return rows.length > 0;
  }

  async insertMany(
    rows: {
      studyRunId: string;
      sourceDocumentId: string;
      userId: string;
      caseId: string;
      discoveredDocumentType?: string | null;
      discoveredRole?: string | null;
      recognitionStatus?: string | null;
      relationshipMetadata: Record<string, unknown>;
      includedInStudy: boolean;
      createdAt: string;
    }[],
  ): Promise<void> {
    const existing = await this.listByStudyRun(rows[0]?.studyRunId ?? "");
    for (const row of rows) {
      if (
        existing.some(
          (snapshot) =>
            snapshot.sourceDocumentId === row.sourceDocumentId &&
            snapshot.includedInStudy === row.includedInStudy,
        )
      ) {
        continue;
      }
      await this.gateway.insert(
        "study_run_documents",
        withSessionOwner(this.userId, {
          study_run_id: row.studyRunId,
          source_document_id: row.sourceDocumentId,
          user_id: row.userId,
          case_id: row.caseId,
          discovered_document_type: row.discoveredDocumentType,
          discovered_role: row.discoveredRole,
          recognition_status: row.recognitionStatus,
          relationship_metadata: row.relationshipMetadata,
          included_in_study: row.includedInStudy,
          created_at: row.createdAt,
        }),
      );
    }
  }

  async listByStudyRun(studyRunId: string): Promise<
    { studyRunId: string; sourceDocumentId: string; includedInStudy: boolean }[]
  > {
    const rows = await this.gateway.selectWhere("study_run_documents", {
      study_run_id: studyRunId,
      user_id: this.userId,
    });
    return rows.map((row) => ({
      studyRunId: text(row, "study_run_id"),
      sourceDocumentId: text(row, "source_document_id"),
      includedInStudy: Boolean(row.included_in_study),
    }));
  }
}

export class SupabaseIntelligenceLineageRepository implements IntelligenceLineageRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async insertMany(records: IntelligenceLineageRecord[]): Promise<void> {
    for (const record of records) {
      await this.gateway.insert(
        "intelligence_lineage",
        withSessionOwner(this.userId, {
          id: record.id,
          user_id: record.userId,
          case_id: record.caseId,
          study_run_id: record.studyRunId,
          intelligence_item_type: record.intelligenceItemType,
          intelligence_item_id: record.intelligenceItemId,
          source_class: record.sourceClass,
          logical_document_id: record.logicalDocumentId ?? null,
          source_document_id: record.sourceDocumentId,
          question_id: record.questionId,
          answer_id: record.answerId,
          parent_intelligence_item_id: record.parentIntelligenceItemId,
          metadata: record.metadata,
          created_at: record.createdAt,
        }),
      );
    }
  }

  async listByStudyRun(studyRunId: string): Promise<IntelligenceLineageRecord[]> {
    const rows = await this.gateway.selectWhere("intelligence_lineage", {
      user_id: this.userId,
      study_run_id: studyRunId,
    });
    return rows.map((row) => ({
      id: text(row, "id"),
      userId: text(row, "user_id"),
      caseId: text(row, "case_id"),
      studyRunId: text(row, "study_run_id"),
      intelligenceItemType: text(row, "intelligence_item_type"),
      intelligenceItemId: text(row, "intelligence_item_id"),
      sourceClass: text(row, "source_class") as IntelligenceLineageRecord["sourceClass"],
      logicalDocumentId:
        row.logical_document_id == null ? null : String(row.logical_document_id),
      sourceDocumentId: row.source_document_id == null ? null : text(row, "source_document_id"),
      questionId: row.question_id == null ? null : text(row, "question_id"),
      answerId: row.answer_id == null ? null : text(row, "answer_id"),
      parentIntelligenceItemId:
        row.parent_intelligence_item_id == null
          ? null
          : String(row.parent_intelligence_item_id),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: text(row, "created_at"),
    }));
  }
}

/** Service-role gateway: cross-case learning infrastructure without user RLS. */
export class SupabaseDomainLearningObservationRepository
  implements DomainLearningObservationRepository
{
  constructor(private readonly gateway: HiveGateway) {}

  async append(observation: DomainLearningObservation): Promise<void> {
    await this.gateway.insert("domain_learning_observations", {
      id: observation.id,
      domain_id: observation.domainId,
      domain_pack_id: observation.domainPackId,
      domain_pack_version: observation.domainPackVersion,
      case_id: observation.caseId,
      study_run_id: observation.studyRunId,
      observation_type: observation.observationType,
      subject_key: observation.subjectKey,
      observation_json: observation.observationJson,
      question_id: observation.questionId ?? null,
      answer_id: observation.answerId ?? null,
      source_document_id: observation.sourceDocumentId ?? null,
      observation_schema_version: observation.observationSchemaVersion,
      created_at: observation.createdAt,
    });
  }

  async listByStudyRun(studyRunId: string): Promise<DomainLearningObservation[]> {
    const rows = await this.gateway.selectWhere("domain_learning_observations", {
      study_run_id: studyRunId,
    });
    return rows.map((row) => ({
      id: text(row, "id"),
      domainId: text(row, "domain_id"),
      domainPackId: text(row, "domain_pack_id"),
      domainPackVersion: text(row, "domain_pack_version"),
      caseId: text(row, "case_id"),
      studyRunId: text(row, "study_run_id"),
      observationType: text(row, "observation_type") as DomainLearningObservation["observationType"],
      subjectKey: text(row, "subject_key"),
      observationJson: (row.observation_json ?? {}) as Record<string, unknown>,
      observationSchemaVersion: String(row.observation_schema_version ?? "1") as "1",
      questionId: row.question_id == null ? null : String(row.question_id),
      answerId: row.answer_id == null ? null : String(row.answer_id),
      sourceDocumentId:
        row.source_document_id == null ? null : String(row.source_document_id),
      createdAt: text(row, "created_at"),
    }));
  }
}

export class SupabaseDomainLearningCandidateRepository
  implements DomainLearningCandidateRepository
{
  constructor(private readonly gateway: HiveGateway) {}

  async insert(candidate: DomainLearningCandidate): Promise<void> {
    await this.gateway.insert("domain_learning_candidates", {
      id: candidate.id,
      domain_id: candidate.domainId,
      candidate_type: candidate.candidateType,
      subject_key: candidate.subjectKey,
      proposed_learning: candidate.proposedLearning,
      supporting_observation_count: candidate.supportingObservationCount,
      status: candidate.status,
      created_at: candidate.createdAt,
      reviewed_at: candidate.reviewedAt ?? null,
      reviewed_by: candidate.reviewedBy ?? null,
      certified_domain_pack_version: candidate.certifiedDomainPackVersion ?? null,
      source_domain_pack_id: candidate.sourceDomainPackId ?? null,
      source_domain_pack_version: candidate.sourceDomainPackVersion ?? null,
    });
    for (const observationId of candidate.supportingObservationIds) {
      await this.gateway.insert("domain_learning_candidate_observations", {
        candidate_id: candidate.id,
        observation_id: observationId,
      });
    }
  }

  async getById(id: string): Promise<DomainLearningCandidate | null> {
    const rows = await this.gateway.selectWhere(
      "domain_learning_candidates",
      { id },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    const links = await this.gateway.selectWhere("domain_learning_candidate_observations", {
      candidate_id: id,
    });
    return {
      id: text(row, "id"),
      domainId: text(row, "domain_id"),
      candidateType: text(row, "candidate_type"),
      subjectKey: text(row, "subject_key"),
      proposedLearning: (row.proposed_learning ?? {}) as Record<string, unknown>,
      supportingObservationCount: Number(row.supporting_observation_count),
      status: text(row, "status") as DomainLearningCandidate["status"],
      createdAt: text(row, "created_at"),
      reviewedAt: row.reviewed_at == null ? null : String(row.reviewed_at),
      reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
      certifiedDomainPackVersion:
        row.certified_domain_pack_version == null
          ? null
          : String(row.certified_domain_pack_version),
      sourceDomainPackId:
        row.source_domain_pack_id == null ? null : String(row.source_domain_pack_id),
      sourceDomainPackVersion:
        row.source_domain_pack_version == null
          ? null
          : String(row.source_domain_pack_version),
      supportingObservationIds: links.map((link) => text(link, "observation_id")),
    };
  }
}

export function createSupabaseDomainLearningPort(
  userGateway: HiveGateway,
  adminGateway: HiveGateway,
  userId: string,
): {
  caseQuestions: SupabaseCaseQuestionRepository;
  caseAnswers: SupabaseCaseQuestionAnswerRepository;
  studyRunAnswers: SupabaseStudyRunQuestionAnswerRepository;
  studyRunDocuments: SupabaseStudyRunDocumentRepository;
  lineage: SupabaseIntelligenceLineageRepository;
  observations: SupabaseDomainLearningObservationRepository;
  candidates: SupabaseDomainLearningCandidateRepository;
} {
  return {
    caseQuestions: new SupabaseCaseQuestionRepository(userGateway, userId),
    caseAnswers: new SupabaseCaseQuestionAnswerRepository(userGateway, userId),
    studyRunAnswers: new SupabaseStudyRunQuestionAnswerRepository(userGateway, userId),
    studyRunDocuments: new SupabaseStudyRunDocumentRepository(userGateway, userId),
    lineage: new SupabaseIntelligenceLineageRepository(userGateway, userId),
    observations: new SupabaseDomainLearningObservationRepository(adminGateway),
    candidates: new SupabaseDomainLearningCandidateRepository(adminGateway),
  };
}
