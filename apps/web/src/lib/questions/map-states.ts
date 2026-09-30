import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";

import type {
  MapNodeResolutionState,
  MissingDocumentAnswerValue,
  QuestionAnswerRecord,
  QuestionDefinition,
  SingleChoiceAnswerValue,
} from "./types";

export type CompactMapItem =
  | {
      kind: "document";
      id: string;
      label: string;
      sublabel?: string;
      state: MapNodeResolutionState;
      highlighted?: boolean;
    }
  | {
      kind: "missing";
      id: string;
      label: string;
      sublabel?: string;
      state: MapNodeResolutionState;
      highlighted?: boolean;
    };

export function missingStateFromAnswer(
  value: MissingDocumentAnswerValue | undefined,
): MapNodeResolutionState {
  if (!value) {
    return "EXPECTED";
  }
  switch (value.disposition) {
    case "add_document":
      return "PROVIDED";
    case "unavailable":
      return "UNAVAILABLE";
    case "not_applicable":
      return "NOT_APPLICABLE";
    default:
      return "EXPECTED";
  }
}

export function ambiguityStateFromAnswer(
  value: SingleChoiceAnswerValue | undefined,
): MapNodeResolutionState {
  if (!value?.choiceId) {
    return "AMBIGUOUS";
  }
  return "RESOLVED";
}

export function buildCompactMapItems(
  discovery: DocumentDiscoveryResult,
  missingNodeStates: Record<string, MapNodeResolutionState>,
  ambiguityNodeStates: Record<string, MapNodeResolutionState>,
  highlightNodeIds: Set<string>,
): CompactMapItem[] {
  const items: CompactMapItem[] = [];

  const sortedDocs = [...discovery.documents].sort(
    (a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999),
  );

  for (const doc of sortedDocs) {
    const ambiguityState = ambiguityNodeStates[doc.id];
    items.push({
      kind: "document",
      id: doc.id,
      label: doc.originalFilename,
      sublabel: doc.documentDate,
      state: ambiguityState ?? "RESOLVED",
      highlighted: highlightNodeIds.has(doc.id),
    });
  }

  const sortedMissing = [...discovery.missingDocuments].sort(
    (a, b) => (a.sequenceOrder ?? 999) - (b.sequenceOrder ?? 999),
  );

  for (const missing of sortedMissing) {
    items.push({
      kind: "missing",
      id: missing.id,
      label: missing.expectedDocumentType,
      sublabel: "Expected in sequence",
      state: missingNodeStates[missing.id] ?? "EXPECTED",
      highlighted: highlightNodeIds.has(missing.id),
    });
  }

  return items;
}

export function deriveMapStatesFromAnswers(
  questions: QuestionDefinition[],
  answers: Record<string, QuestionAnswerRecord>,
): {
  missingNodeStates: Record<string, MapNodeResolutionState>;
  ambiguityNodeStates: Record<string, MapNodeResolutionState>;
} {
  const missingNodeStates: Record<string, MapNodeResolutionState> = {};
  const ambiguityNodeStates: Record<string, MapNodeResolutionState> = {};

  for (const question of questions) {
    const record = answers[question.id];
    if (question.answerKind === "missing_document_disposition" && question.missingDocumentId) {
      missingNodeStates[question.missingDocumentId] = missingStateFromAnswer(
        record?.value as MissingDocumentAnswerValue | undefined,
      );
    }
    if (question.answerKind === "single_choice" && question.relatedDocumentIds?.length) {
      const state = ambiguityStateFromAnswer(
        record?.value as SingleChoiceAnswerValue | undefined,
      );
      for (const docId of question.relatedDocumentIds) {
        ambiguityNodeStates[docId] = state;
      }
    }
  }

  return { missingNodeStates, ambiguityNodeStates };
}
