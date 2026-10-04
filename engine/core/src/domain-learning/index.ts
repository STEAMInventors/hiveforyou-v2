import {
  InMemoryCaseQuestionAnswerRepository,
  InMemoryCaseQuestionRepository,
  InMemoryDomainLearningCandidateRepository,
  InMemoryDomainLearningObservationRepository,
  InMemoryIntelligenceLineageRepository,
  InMemoryStudyRunDocumentRepository,
  InMemoryStudyRunQuestionAnswerRepository,
  type CaseQuestionAnswerRepository,
  type CaseQuestionRepository,
  type DomainLearningCandidateRepository,
  type DomainLearningObservationRepository,
  type IntelligenceLineageRepository,
  type StudyRunDocumentRepository,
  type StudyRunQuestionAnswerRepository,
} from "./repositories";

export * from "./learning-candidate";
export * from "./observation-sanitize";
export * from "./prepare-study-learning";
export * from "./question-metadata";
export * from "./record-observation";
export * from "./record-post-validation-learning";
export * from "./repositories";

export type DomainLearningPort = {
  caseQuestions: CaseQuestionRepository;
  caseAnswers: CaseQuestionAnswerRepository;
  studyRunAnswers: StudyRunQuestionAnswerRepository;
  studyRunDocuments: StudyRunDocumentRepository;
  lineage: IntelligenceLineageRepository;
  observations: DomainLearningObservationRepository;
  candidates: DomainLearningCandidateRepository;
};

export function createInMemoryDomainLearningPort(): DomainLearningPort {
  return {
    caseQuestions: new InMemoryCaseQuestionRepository(),
    caseAnswers: new InMemoryCaseQuestionAnswerRepository(),
    studyRunAnswers: new InMemoryStudyRunQuestionAnswerRepository(),
    studyRunDocuments: new InMemoryStudyRunDocumentRepository(),
    lineage: new InMemoryIntelligenceLineageRepository(),
    observations: new InMemoryDomainLearningObservationRepository(),
    candidates: new InMemoryDomainLearningCandidateRepository(),
  };
}
