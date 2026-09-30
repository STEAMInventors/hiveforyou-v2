import { randomUUID } from "node:crypto";

import type {
  CaseQuestionAnswerRecord,
  CaseQuestionRecord,
  DomainLearningCandidate,
  DomainLearningObservation,
  IntelligenceLineageRecord,
} from "@hiveforyou/shared/domain-learning";

export interface CaseQuestionRepository {
  findByCaseAndKey(
    caseId: string,
    questionSetVersion: string,
    questionKey: string,
    wordingVersion: string,
  ): Promise<CaseQuestionRecord | null>;
  insert(question: CaseQuestionRecord): Promise<void>;
  listByCase(caseId: string): Promise<CaseQuestionRecord[]>;
}

export interface CaseQuestionAnswerRepository {
  getLatestVersion(questionId: string): Promise<CaseQuestionAnswerRecord | null>;
  insert(answer: CaseQuestionAnswerRecord): Promise<void>;
  listByQuestion(questionId: string): Promise<CaseQuestionAnswerRecord[]>;
}

export interface StudyRunQuestionAnswerRepository {
  bind(input: {
    studyRunId: string;
    questionId: string;
    answerId: string;
  }): Promise<void>;
  listByStudyRun(studyRunId: string): Promise<
    { studyRunId: string; questionId: string; answerId: string }[]
  >;
}

export interface StudyRunDocumentRepository {
  snapshotExists(studyRunId: string): Promise<boolean>;
  insertMany(
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
  ): Promise<void>;
  listByStudyRun(studyRunId: string): Promise<
    {
      studyRunId: string;
      sourceDocumentId: string;
      includedInStudy: boolean;
    }[]
  >;
}

export interface IntelligenceLineageRepository {
  insertMany(records: IntelligenceLineageRecord[]): Promise<void>;
  listByStudyRun(studyRunId: string): Promise<IntelligenceLineageRecord[]>;
}

export interface DomainLearningObservationRepository {
  append(observation: DomainLearningObservation): Promise<void>;
  listByStudyRun(studyRunId: string): Promise<DomainLearningObservation[]>;
}

export interface DomainLearningCandidateRepository {
  insert(candidate: DomainLearningCandidate): Promise<void>;
  getById(id: string): Promise<DomainLearningCandidate | null>;
}

export class InMemoryCaseQuestionRepository implements CaseQuestionRepository {
  private readonly rows: CaseQuestionRecord[] = [];

  async findByCaseAndKey(
    caseId: string,
    questionSetVersion: string,
    questionKey: string,
    wordingVersion: string,
  ): Promise<CaseQuestionRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.caseId === caseId &&
          row.questionSetVersion === questionSetVersion &&
          row.questionKey === questionKey &&
          row.wordingVersion === wordingVersion,
      ) ?? null
    );
  }

  async insert(question: CaseQuestionRecord): Promise<void> {
    this.rows.push(structuredClone(question));
  }

  async listByCase(caseId: string): Promise<CaseQuestionRecord[]> {
    return this.rows.filter((row) => row.caseId === caseId).map((row) => structuredClone(row));
  }
}

export class InMemoryCaseQuestionAnswerRepository implements CaseQuestionAnswerRepository {
  private readonly rows: CaseQuestionAnswerRecord[] = [];

  async getLatestVersion(questionId: string): Promise<CaseQuestionAnswerRecord | null> {
    const versions = this.rows
      .filter((row) => row.questionId === questionId)
      .sort((a, b) => b.answerVersion - a.answerVersion);
    return versions[0] ? structuredClone(versions[0]) : null;
  }

  async insert(answer: CaseQuestionAnswerRecord): Promise<void> {
    const duplicate = this.rows.some(
      (row) =>
        row.questionId === answer.questionId && row.answerVersion === answer.answerVersion,
    );
    if (duplicate) {
      throw new Error("ANSWER_VERSION_EXISTS");
    }
    this.rows.push(structuredClone(answer));
  }

  async listByQuestion(questionId: string): Promise<CaseQuestionAnswerRecord[]> {
    return this.rows
      .filter((row) => row.questionId === questionId)
      .sort((a, b) => a.answerVersion - b.answerVersion)
      .map((row) => structuredClone(row));
  }
}

export class InMemoryStudyRunQuestionAnswerRepository
  implements StudyRunQuestionAnswerRepository
{
  private readonly rows: {
    studyRunId: string;
    questionId: string;
    answerId: string;
  }[] = [];

  async bind(input: {
    studyRunId: string;
    questionId: string;
    answerId: string;
  }): Promise<void> {
    const exists = this.rows.some(
      (row) => row.studyRunId === input.studyRunId && row.questionId === input.questionId,
    );
    if (exists) {
      throw new Error("STUDY_RUN_QUESTION_ANSWER_EXISTS");
    }
    this.rows.push({ ...input });
  }

  async listByStudyRun(studyRunId: string): Promise<
    { studyRunId: string; questionId: string; answerId: string }[]
  > {
    return this.rows.filter((row) => row.studyRunId === studyRunId).map((row) => ({ ...row }));
  }
}

export class InMemoryStudyRunDocumentRepository implements StudyRunDocumentRepository {
  private readonly rows: {
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
  }[] = [];

  async snapshotExists(studyRunId: string): Promise<boolean> {
    return this.rows.some((row) => row.studyRunId === studyRunId);
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
    for (const row of rows) {
      const dup = this.rows.some(
        (existing) =>
          existing.studyRunId === row.studyRunId &&
          existing.sourceDocumentId === row.sourceDocumentId,
      );
      if (dup) {
        throw new Error("STUDY_RUN_DOCUMENT_EXISTS");
      }
      this.rows.push({ ...row });
    }
  }

  async listByStudyRun(studyRunId: string): Promise<
    { studyRunId: string; sourceDocumentId: string; includedInStudy: boolean }[]
  > {
    return this.rows
      .filter((row) => row.studyRunId === studyRunId)
      .map((row) => ({
        studyRunId: row.studyRunId,
        sourceDocumentId: row.sourceDocumentId,
        includedInStudy: row.includedInStudy,
      }));
  }
}

export class InMemoryIntelligenceLineageRepository implements IntelligenceLineageRepository {
  private readonly rows: IntelligenceLineageRecord[] = [];

  async insertMany(records: IntelligenceLineageRecord[]): Promise<void> {
    this.rows.push(...records.map((record) => structuredClone(record)));
  }

  async listByStudyRun(studyRunId: string): Promise<IntelligenceLineageRecord[]> {
    return this.rows
      .filter((row) => row.studyRunId === studyRunId)
      .map((row) => structuredClone(row));
  }
}

export class InMemoryDomainLearningObservationRepository
  implements DomainLearningObservationRepository
{
  readonly rows: DomainLearningObservation[] = [];

  async append(observation: DomainLearningObservation): Promise<void> {
    this.rows.push(structuredClone(observation));
  }

  async listByStudyRun(studyRunId: string): Promise<DomainLearningObservation[]> {
    return this.rows
      .filter((row) => row.studyRunId === studyRunId)
      .map((row) => structuredClone(row));
  }
}

export class InMemoryDomainLearningCandidateRepository
  implements DomainLearningCandidateRepository
{
  private readonly rows = new Map<string, DomainLearningCandidate>();

  async insert(candidate: DomainLearningCandidate): Promise<void> {
    this.rows.set(candidate.id, structuredClone(candidate));
  }

  async getById(id: string): Promise<DomainLearningCandidate | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }
}

export function newObservationId(): string {
  return randomUUID();
}
