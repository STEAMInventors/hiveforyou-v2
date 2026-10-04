"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { DocumentDiscoveryDocument } from "@/lib/document-discovery/types";
import { isQuestionAnswered } from "@/lib/questions/completion";
import { useQuestionsSession } from "@/lib/questions/questions-session-context";
import type {
  ContextChangeAnswerValue,
  FreeTextAnswerValue,
  MissingDocumentAnswerValue,
  MultiSelectAnswerValue,
  QuestionDefinition,
  QuestionGroupId,
  SingleChoiceAnswerValue,
} from "@/lib/questions/types";

import { AnalysisIntentQuestion } from "./AnalysisIntentQuestion";
import { CompactDocumentStructureMap } from "./CompactDocumentStructureMap";
import { ContextQuestion } from "./ContextQuestion";
import { DocumentAmbiguityQuestion } from "./DocumentAmbiguityQuestion";
import { MissingDocumentQuestion } from "./MissingDocumentQuestion";
import { OptionalContextQuestion } from "./OptionalContextQuestion";
import { QuestionGroup } from "./QuestionGroup";
import {
  STUDY_ROUTE,
  stashStudySnapshot,
} from "@/lib/canonical-study/study-navigation";

import { StudyCaseCta } from "./StudyCaseCta";

const GROUP_ORDER: QuestionGroupId[] = [
  "complete_picture",
  "understand_situation",
  "what_matters",
];

function resolveRelatedDocuments(
  question: QuestionDefinition,
  documents: DocumentDiscoveryDocument[],
): DocumentDiscoveryDocument[] {
  if (!question.relatedDocumentIds?.length) {
    return [];
  }
  const byId = new Map(documents.map((d) => [d.id, d]));
  return question.relatedDocumentIds
    .map((id) => byId.get(id))
    .filter((d): d is DocumentDiscoveryDocument => Boolean(d));
}

function QuestionRenderer({ question }: { question: QuestionDefinition }) {
  const { discovery, answers, setAnswer, clearAnswer, addMissingDocument } =
    useQuestionsSession();
  const record = answers[question.id];

  switch (question.answerKind) {
    case "missing_document_disposition":
      return (
        <MissingDocumentQuestion
          question={question}
          value={record?.value as MissingDocumentAnswerValue | undefined}
          onSelectDisposition={(disposition) =>
            setAnswer(question.id, { disposition })
          }
          onAddFile={(file) => addMissingDocument(question.id, file)}
          onClearAttachment={() => clearAnswer(question.id)}
        />
      );
    case "single_choice":
      return (
        <DocumentAmbiguityQuestion
          question={question}
          relatedDocuments={resolveRelatedDocuments(question, discovery.documents)}
          value={record?.value as SingleChoiceAnswerValue | undefined}
          onSelect={(choiceId) => setAnswer(question.id, { choiceId })}
        />
      );
    case "context_change":
      return (
        <ContextQuestion
          question={question}
          value={record?.value as ContextChangeAnswerValue | undefined}
          onChange={(value) => setAnswer(question.id, value)}
        />
      );
    case "multi_select":
      return (
        <AnalysisIntentQuestion
          question={question}
          value={record?.value as MultiSelectAnswerValue | undefined}
          onChange={(value) => setAnswer(question.id, value)}
        />
      );
    case "free_text":
      return (
        <OptionalContextQuestion
          question={question}
          value={record?.value as FreeTextAnswerValue | undefined}
          onChange={(value) => setAnswer(question.id, value)}
        />
      );
    default:
      return null;
  }
}

export function QuestionWorkspace() {
  const router = useRouter();
  const {
    discovery,
    questionSet,
    answers,
    missingNodeStates,
    ambiguityNodeStates,
    progress,
    snapshot,
  } = useQuestionsSession();

  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(
    null,
  );
  const [submittingStudy, setSubmittingStudy] = useState(false);

  const highlightNodeIds = useMemo(() => {
    const question = questionSet.questions.find((q) => q.id === focusedQuestionId);
    if (!question) {
      return [];
    }
    return [
      ...(question.relatedUnresolvedNodeIds ?? []),
      ...(question.relatedDocumentIds ?? []),
    ];
  }, [focusedQuestionId, questionSet.questions]);

  const questionsByGroup = useMemo(() => {
    const map = new Map<QuestionGroupId, QuestionDefinition[]>();
    for (const groupId of GROUP_ORDER) {
      map.set(
        groupId,
        questionSet.questions.filter((q) => q.groupId === groupId),
      );
    }
    return map;
  }, [questionSet.questions]);

  return (
    <div data-testid="questions-workspace" className="w-full pb-32">
      <CompactDocumentStructureMap
        discovery={discovery}
        missingNodeStates={missingNodeStates}
        ambiguityNodeStates={ambiguityNodeStates}
        highlightNodeIds={highlightNodeIds}
      />

      <div className="mt-10 space-y-10">
        {GROUP_ORDER.map((groupId) => {
          const groupQuestions = questionsByGroup.get(groupId) ?? [];
          if (!groupQuestions.length) {
            return null;
          }
          return (
            <QuestionGroup
              key={groupId}
              groupId={groupId}
              questionCount={groupQuestions.length}
            >
              {groupQuestions.map((question) => (
                <div
                  key={question.id}
                  onFocusCapture={() => setFocusedQuestionId(question.id)}
                  onBlurCapture={() => setFocusedQuestionId(null)}
                >
                  <QuestionRenderer question={question} />
                </div>
              ))}
            </QuestionGroup>
          );
        })}
      </div>

      <StudyCaseCta
        enabled={progress.canStudy}
        requiredAnswered={progress.requiredAnswered}
        requiredTotal={progress.requiredTotal}
        submitting={submittingStudy}
        onStudy={() => {
          if (!progress.canStudy || submittingStudy) {
            return;
          }
          setSubmittingStudy(true);
          stashStudySnapshot(snapshot);
          router.push(STUDY_ROUTE);
        }}
      />

      <div className="sr-only" aria-live="polite">
        {questionSet.questions.filter((q) =>
          isQuestionAnswered(q, answers),
        ).length}{" "}
        questions answered
      </div>
    </div>
  );
}
