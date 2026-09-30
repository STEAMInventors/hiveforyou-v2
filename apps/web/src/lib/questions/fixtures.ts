import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";

import type { QuestionDefinition, QuestionSet } from "./types";

const QUESTION_SET_ID = "v2-001d-design-fixtures";

function findDocumentByCatalogHint(
  discovery: DocumentDiscoveryResult,
  hints: RegExp[],
): string | undefined {
  return discovery.documents.find((doc) =>
    hints.some(
      (hint) =>
        hint.test(doc.originalFilename) ||
        hint.test(doc.documentType) ||
        hint.test(doc.title),
    ),
  )?.id;
}

function latestDocumentDate(discovery: DocumentDiscoveryResult): string | undefined {
  const dates = discovery.documents
    .map((d) => d.documentDate)
    .filter((d): d is string => Boolean(d));
  if (!dates.length) {
    return undefined;
  }
  return dates.sort().at(-1);
}

/**
 * Design fixtures for V2-001D UX — generated from Engine 1 discovery shape, not Engine 2 findings.
 */
export function buildQuestionSetFromDiscovery(
  discovery: DocumentDiscoveryResult,
): QuestionSet {
  const missingProgress =
    discovery.missingDocuments.find((m) => m.id === "missing-progress-2023") ??
    discovery.missingDocuments[0];

  const latestDate = latestDocumentDate(discovery);
  const datePhrase = latestDate
    ? `Your latest document is dated ${latestDate}.`
    : "Based on the dates in your collection.";

  const questions: QuestionDefinition[] = [];

  if (missingProgress) {
    questions.push({
      id: "q-missing-progress",
      questionKey: "missing_expected_document",
      wordingVersion: "v1",
      triggerType: "MISSING_EXPECTED_DOCUMENT",
      triggerKey: missingProgress.id,
      triggerMetadata: { subjectKey: missingProgress.id, missingDocumentId: missingProgress.id },
      type: "MISSING_FACT",
      groupId: "complete_picture",
      kicker: "Something may be missing",
      prompt: "Do you have the progress report from the previous school year?",
      humanReason:
        "Hive expected this document based on the document sequence you provided.",
      required: true,
      answerKind: "missing_document_disposition",
      options: [
        { id: "add_document", label: "I can add it" },
        { id: "unavailable", label: "I don't have it" },
        { id: "not_applicable", label: "Not applicable" },
      ],
      missingDocumentId: missingProgress.id,
      relatedUnresolvedNodeIds: [missingProgress.id],
      affectsCanonicalTruth: true,
      affectsAnalysis: true,
      affectsProjection: true,
      triggerRefs: [{ kind: "missing_node", id: missingProgress.id }],
    });
  }

  questions.push({
    id: "q-context-changes",
    type: "CASE_CONTEXT",
    groupId: "understand_situation",
    kicker: "Help Hive understand your situation",
    prompt: latestDate
      ? `Has anything important changed since these documents were created?`
      : "Has anything important changed since these documents were created?",
    humanReason: datePhrase,
    required: true,
    answerKind: "context_change",
    options: [
      { id: "unchanged", label: "Nothing important has changed" },
      { id: "changed", label: "Yes, something has changed" },
    ],
    affectsCanonicalTruth: false,
    affectsAnalysis: true,
    affectsProjection: true,
    triggerRefs: [{ kind: "sequence", id: "latest-date" }],
  });

  questions.push({
    id: "q-analysis-intent",
    type: "ANALYSIS_INTENT",
    groupId: "what_matters",
    kicker: "What matters most to you",
    prompt: "What are you most trying to understand?",
    humanReason: "Knowing this helps Hive focus the study.",
    required: true,
    answerKind: "multi_select",
    options: [
      { id: "improving", label: "Whether things are improving" },
      { id: "plan_match", label: "Whether the current plan matches the needs" },
      { id: "over_time", label: "What changed over time" },
      { id: "meeting_prep", label: "What I should pay attention to before a meeting" },
      { id: "something_else", label: "Something else" },
    ],
    affectsCanonicalTruth: false,
    affectsAnalysis: true,
    affectsProjection: true,
    triggerRefs: [{ kind: "intent", id: "analysis-priorities" }],
  });

  questions.push({
    id: "q-optional-context",
    type: "CASE_CONTEXT",
    groupId: "what_matters",
    prompt: "Anything else you'd like Hive to know?",
    humanReason: "Optional context you want considered during the study.",
    required: false,
    answerKind: "free_text",
    affectsCanonicalTruth: false,
    affectsAnalysis: true,
    affectsProjection: true,
  });

  return {
    id: QUESTION_SET_ID,
    questions,
  };
}
