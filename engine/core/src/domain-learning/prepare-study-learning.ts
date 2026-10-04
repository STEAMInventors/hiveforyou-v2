import { randomUUID } from "node:crypto";

import type {
  CaseQuestionAnswerRecord,
  CaseQuestionRecord,
} from "@hiveforyou/shared/domain-learning";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import { hashCanonicalJson } from "../study/fingerprint";
import {
  buildTriggerMetadata,
  resolveQuestionKey,
  resolveQuestionType,
  resolveTriggerKey,
  resolveTriggerType,
} from "./question-metadata";
import {
  extractDispositionFromAnswer,
  sanitizeAnswerForObservation,
} from "./observation-sanitize";
import { recordDomainLearningObservation } from "./record-observation";
import type {
  CaseQuestionAnswerRepository,
  CaseQuestionRepository,
  DomainLearningObservationRepository,
  StudyRunDocumentRepository,
  StudyRunQuestionAnswerRepository,
} from "./repositories";

export type StudyLearningPrepResult = {
  questionsByClientId: Map<string, CaseQuestionRecord>;
  answersByClientId: Map<string, CaseQuestionAnswerRecord>;
};

export type StudyLearningPrepDeps = {
  caseQuestions: CaseQuestionRepository;
  caseAnswers: CaseQuestionAnswerRepository;
  studyRunAnswers: StudyRunQuestionAnswerRepository;
  studyRunDocuments: StudyRunDocumentRepository;
  observations: DomainLearningObservationRepository;
};

export async function prepareStudyLearningArtifacts(
  deps: StudyLearningPrepDeps,
  context: CanonicalStudyContext,
  userId: string,
): Promise<StudyLearningPrepResult> {
  const questionsByClientId = new Map<string, CaseQuestionRecord>();
  const answersByClientId = new Map<string, CaseQuestionAnswerRecord>();
  const existingBindings = await deps.studyRunAnswers.listByStudyRun(context.studyRunId);
  if (
    existingBindings.length > 0 &&
    (await deps.studyRunDocuments.snapshotExists(context.studyRunId))
  ) {
    const caseQuestions = await deps.caseQuestions.listByCase(context.caseId);
    for (const question of caseQuestions) {
      questionsByClientId.set(question.clientQuestionId, question);
    }
    for (const binding of existingBindings) {
      const question = caseQuestions.find((row) => row.id === binding.questionId);
      if (!question) {
        continue;
      }
      const versions = await deps.caseAnswers.listByQuestion(binding.questionId);
      const answer = versions.find((row) => row.id === binding.answerId);
      if (answer) {
        answersByClientId.set(question.clientQuestionId, answer);
      }
    }
    return { questionsByClientId, answersByClientId };
  }

  const now = new Date().toISOString();

  for (const definition of context.questionSet.questions) {
    const questionKey = resolveQuestionKey(definition);
    const wordingVersion = definition.wordingVersion ?? "v1";
    let persisted = await deps.caseQuestions.findByCaseAndKey(
      context.caseId,
      context.questionSetVersion,
      questionKey,
      wordingVersion,
    );
    if (!persisted) {
      persisted = {
        id: randomUUID(),
        userId,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        questionSetVersion: context.questionSetVersion,
        questionKey,
        questionType: resolveQuestionType(definition),
        wordingVersion,
        questionText: definition.prompt,
        required: definition.required,
        triggerType: resolveTriggerType(definition),
        triggerKey: resolveTriggerKey(definition),
        triggerMetadata: buildTriggerMetadata(definition),
        affectsCanonicalTruth: definition.affectsCanonicalTruth,
        affectsAnalysis: definition.affectsAnalysis,
        affectsProjection: definition.affectsProjection,
        createdAt: now,
        clientQuestionId: definition.id,
      };
      await deps.caseQuestions.insert(persisted);
    }
    questionsByClientId.set(definition.id, persisted);

    await recordDomainLearningObservation(deps.observations, {
      domainId: context.domainId,
      domainPackId: context.domainPackId,
      domainPackVersion: context.domainPackVersion,
      caseId: context.caseId,
      studyRunId: context.studyRunId,
      observationType: "QUESTION_ASKED",
      subjectKey: questionKey,
      questionId: persisted.id,
      observationJson: {
        triggerType: persisted.triggerType,
        triggerKey: persisted.triggerKey,
        required: persisted.required,
      },
    });

    if (
      persisted.triggerType === "AMBIGUOUS_DOCUMENT_IDENTITY" ||
      persisted.triggerType === "AMBIGUOUS_RELATIONSHIP"
    ) {
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "AMBIGUITY_FOUND",
        subjectKey: persisted.triggerKey ?? questionKey,
        questionId: persisted.id,
        observationJson: {
          triggerType: persisted.triggerType,
        },
      });
    }

    const answerRecord = context.answerSnapshot.answers[definition.id];
    if (answerRecord) {
      const answerValue = answerRecord.value as Record<string, unknown>;
      const latest = await deps.caseAnswers.getLatestVersion(persisted.id);
      const nextVersion = (latest?.answerVersion ?? 0) + 1;
      const valueHash = hashCanonicalJson(answerValue);
      const latestHash = latest ? hashCanonicalJson(latest.answerValue) : null;
      let answer: CaseQuestionAnswerRecord;
      if (latest && latestHash === valueHash) {
        answer = latest;
      } else {
        answer = {
          id: randomUUID(),
          questionId: persisted.id,
          userId,
          caseId: context.caseId,
          answerVersion: nextVersion,
          answerValue,
          disposition: extractDispositionFromAnswer(definition.answerKind, answerValue),
          supersedesAnswerId: latest?.id ?? null,
          answeredAt: answerRecord.updatedAt,
          createdAt: now,
        };
        await deps.caseAnswers.insert(answer);
      }
      answersByClientId.set(definition.id, answer);

      await deps.studyRunAnswers.bind({
        studyRunId: context.studyRunId,
        questionId: persisted.id,
        answerId: answer.id,
      });

      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "QUESTION_ANSWERED",
        subjectKey: questionKey,
        questionId: persisted.id,
        answerId: answer.id,
        observationJson: sanitizeAnswerForObservation(definition.answerKind, answerValue),
      });

      if (definition.answerKind === "missing_document_disposition") {
        const disposition = String(answerValue.disposition ?? "");
        if (disposition === "unavailable") {
          await recordDomainLearningObservation(deps.observations, {
            domainId: context.domainId,
            domainPackId: context.domainPackId,
            domainPackVersion: context.domainPackVersion,
            caseId: context.caseId,
            studyRunId: context.studyRunId,
            observationType: "DOCUMENT_UNAVAILABLE",
            subjectKey: persisted.triggerKey ?? questionKey,
            questionId: persisted.id,
            answerId: answer.id,
            observationJson: { disposition: "UNAVAILABLE" },
          });
        } else if (disposition === "not_applicable") {
          await recordDomainLearningObservation(deps.observations, {
            domainId: context.domainId,
            domainPackId: context.domainPackId,
            domainPackVersion: context.domainPackVersion,
            caseId: context.caseId,
            studyRunId: context.studyRunId,
            observationType: "DOCUMENT_NOT_APPLICABLE",
            subjectKey: persisted.triggerKey ?? questionKey,
            questionId: persisted.id,
            answerId: answer.id,
            observationJson: { disposition: "NOT_APPLICABLE" },
          });
        }
      }
    }
  }

  for (const [nodeId, state] of Object.entries(context.answerSnapshot.missingNodeStates)) {
    if (state === "UNAVAILABLE") {
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "DOCUMENT_UNAVAILABLE",
        subjectKey: nodeId,
        observationJson: { disposition: "UNAVAILABLE" },
      });
    } else if (state === "NOT_APPLICABLE") {
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "DOCUMENT_NOT_APPLICABLE",
        subjectKey: nodeId,
        observationJson: { disposition: "NOT_APPLICABLE" },
      });
    } else if (state === "EXPECTED") {
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "DOCUMENT_EXPECTED_MISSING",
        subjectKey: nodeId,
        observationJson: { disposition: "EXPECTED" },
      });
    }
  }

  if (!(await deps.studyRunDocuments.snapshotExists(context.studyRunId))) {
    const discoveryByStaged = new Map(
      context.engine1Result.documents
        .filter((doc) => doc.stagedDocumentId)
        .map((doc) => [doc.stagedDocumentId!, doc]),
    );
    const rows = context.sourceDocuments.map((source) => {
      const discovery = discoveryByStaged.get(source.stagedDocumentId);
      return {
        studyRunId: context.studyRunId,
        sourceDocumentId: source.sourceDocumentId ?? source.stagedDocumentId,
        userId,
        caseId: context.caseId,
        discoveredDocumentType: discovery?.documentType ?? null,
        discoveredRole: discovery?.familyRole ?? null,
        recognitionStatus: discovery?.recognitionStatus ?? null,
        relationshipMetadata: {},
        includedInStudy: true,
        createdAt: now,
      };
    });
    await deps.studyRunDocuments.insertMany(rows);
    for (const row of rows) {
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "DOCUMENT_PRESENT",
        subjectKey: row.discoveredDocumentType ?? row.sourceDocumentId,
        sourceDocumentId: row.sourceDocumentId,
        observationJson: {
          documentType: row.discoveredDocumentType,
          recognitionStatus: row.recognitionStatus,
          includedInStudy: row.includedInStudy,
        },
      });
    }
  }

  return { questionsByClientId, answersByClientId };
}
