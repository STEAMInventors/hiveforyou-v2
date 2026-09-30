"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { adaptStagedDocumentsToDiscovery } from "@/lib/document-discovery/adapt-staged-to-discovery";
import { readClientDiscovery } from "@/lib/document-discovery/discovery-session";
import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import type { StagedDocument } from "@/lib/staged-documents";

import { countRequiredProgress } from "./completion";
import { buildQuestionSetFromDiscovery } from "./fixtures";
import { deriveMapStatesFromAnswers } from "./map-states";
import type {
  FreeTextAnswerValue,
  MultiSelectAnswerValue,
  QuestionAnswerRecord,
  QuestionAnswerValue,
  QuestionSet,
  QuestionsAnswerSnapshot,
} from "./types";

type QuestionsSessionContextValue = {
  discovery: DocumentDiscoveryResult;
  questionSet: QuestionSet;
  stagedDocuments: StagedDocument[];
  answers: Record<string, QuestionAnswerRecord>;
  missingNodeStates: Record<string, import("./types").MapNodeResolutionState>;
  ambiguityNodeStates: Record<string, import("./types").MapNodeResolutionState>;
  setAnswer: (questionId: string, value: QuestionAnswerValue) => void;
  clearAnswer: (questionId: string) => void;
  addMissingDocument: (questionId: string, file: File) => void;
  progress: ReturnType<typeof countRequiredProgress>;
  snapshot: QuestionsAnswerSnapshot;
};

const QuestionsSessionContext = createContext<
  QuestionsSessionContextValue | undefined
>(undefined);

export function QuestionsSessionProvider({ children }: { children: ReactNode }) {
  const { documents, addDocuments } = useStagedDocuments();
  const discovery = useMemo(
    () => readClientDiscovery() ?? adaptStagedDocumentsToDiscovery(documents),
    [documents],
  );
  const questionSet = useMemo(
    () => buildQuestionSetFromDiscovery(discovery),
    [discovery],
  );

  const [answers, setAnswers] = useState<Record<string, QuestionAnswerRecord>>(
    {},
  );

  const setAnswer = useCallback((questionId: string, value: QuestionAnswerValue) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        questionId,
        value,
        status: "answered",
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  const clearAnswer = useCallback((questionId: string) => {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }, []);

  const addMissingDocument = useCallback(
    (questionId: string, file: File) => {
      const created = addDocuments([file]);
      const staged = created[0];
      if (!staged) {
        return;
      }
      setAnswer(questionId, {
        disposition: "add_document",
        stagedDocumentId: staged.id,
        filename: file.name,
        sizeBytes: file.size,
      });
    },
    [addDocuments, setAnswer],
  );

  const { missingNodeStates, ambiguityNodeStates } = useMemo(
    () => deriveMapStatesFromAnswers(questionSet.questions, answers),
    [questionSet.questions, answers],
  );

  const progress = useMemo(
    () => countRequiredProgress(questionSet.questions, answers),
    [questionSet.questions, answers],
  );

  const snapshot = useMemo((): QuestionsAnswerSnapshot => {
    const intentRecord = answers["q-analysis-intent"];
    const optionalRecord = answers["q-optional-context"];
    return {
      questionSetId: questionSet.id,
      answers,
      missingNodeStates,
      ambiguityNodeStates,
      analysisIntent: intentRecord
        ? (intentRecord.value as MultiSelectAnswerValue)
        : null,
      userContext: optionalRecord
        ? (optionalRecord.value as FreeTextAnswerValue)
        : null,
    };
  }, [
    answers,
    ambiguityNodeStates,
    missingNodeStates,
    questionSet.id,
  ]);

  const value = useMemo(
    () => ({
      discovery,
      questionSet,
      stagedDocuments: documents,
      answers,
      missingNodeStates,
      ambiguityNodeStates,
      setAnswer,
      clearAnswer,
      addMissingDocument,
      progress,
      snapshot,
    }),
    [
      discovery,
      questionSet,
      documents,
      answers,
      missingNodeStates,
      ambiguityNodeStates,
      setAnswer,
      clearAnswer,
      addMissingDocument,
      progress,
      snapshot,
    ],
  );

  return (
    <QuestionsSessionContext.Provider value={value}>
      {children}
    </QuestionsSessionContext.Provider>
  );
}

export function useQuestionsSession(): QuestionsSessionContextValue {
  const ctx = useContext(QuestionsSessionContext);
  if (!ctx) {
    throw new Error(
      "useQuestionsSession must be used within QuestionsSessionProvider",
    );
  }
  return ctx;
}
