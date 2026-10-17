import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";
import type {
  CanonicalStudyReportChangeRow,
  CanonicalStudyReportCustomerBody,
  CanonicalStudyReportFactLine,
  CanonicalStudyReportOpenQuestion,
} from "@hiveforyou/shared/canonical-study-report-projection";

import { humanizeExtractionFieldKey } from "./map-customer-extraction-ui-state";

export type CanonicalStudyExperienceState =
  | "loading"
  | "not_ready"
  | "ready_to_build"
  | "processing"
  | "failure"
  | "study_ready";

export type CanonicalStudyHighlight = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  tone: "blue" | "coral" | "amber" | "green";
  facts: CanonicalStudyReportFactLine[];
};

const HIGHLIGHT_TONES: CanonicalStudyHighlight["tone"][] = ["blue", "coral", "amber"];

export function resolveCanonicalStudyExperienceState(input: {
  loading: boolean;
  hasAcceptedStudyContent: boolean;
  extractionCompleteForExplore: boolean;
  canGenerate: boolean;
  studyRunStatus: StudyRunStatus | null | undefined;
  generateInFlight: boolean;
}): CanonicalStudyExperienceState {
  if (input.loading) {
    return "loading";
  }

  const processing =
    input.generateInFlight ||
    (input.studyRunStatus != null && isStudyRunProcessing(input.studyRunStatus));

  if (processing) {
    return "processing";
  }

  if (input.hasAcceptedStudyContent) {
    return "study_ready";
  }

  if (input.studyRunStatus === "FAILED") {
    return "failure";
  }

  if (!input.canGenerate && !input.extractionCompleteForExplore) {
    return "not_ready";
  }

  if (!input.hasAcceptedStudyContent) {
    return "ready_to_build";
  }

  return "ready_to_build";
}

export function studyRunStatusCustomerLabel(status: StudyRunStatus): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "In progress";
    case "SUCCEEDED":
      return "Complete";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function highlightFromChange(change: CanonicalStudyReportChangeRow, tone: CanonicalStudyHighlight["tone"]): CanonicalStudyHighlight {
  return {
    id: change.relationId,
    kicker: "Change over time",
    title: change.left.displayText || change.right.displayText,
    body: change.right.displayText,
    tone,
    facts: [change.left, change.right],
  };
}

function highlightFromFact(fact: CanonicalStudyReportFactLine, tone: CanonicalStudyHighlight["tone"]): CanonicalStudyHighlight {
  return {
    id: fact.claimRef.fieldKey,
    kicker: humanizeExtractionFieldKey(fact.fieldId),
    title: fact.displayText,
    body: fact.displayText,
    tone,
    facts: [fact],
  };
}

function highlightFromQuestion(
  question: CanonicalStudyReportOpenQuestion,
  tone: CanonicalStudyHighlight["tone"],
): CanonicalStudyHighlight {
  return {
    id: question.id,
    kicker: "Open question",
    title: question.title,
    body: question.detail,
    tone,
    facts: [],
  };
}

export function buildCanonicalStudyHighlights(
  body: CanonicalStudyReportCustomerBody,
  limit = 3,
): CanonicalStudyHighlight[] {
  const highlights: CanonicalStudyHighlight[] = [];
  let toneIndex = 0;
  const nextTone = () => {
    const tone = HIGHLIGHT_TONES[toneIndex % HIGHLIGHT_TONES.length] ?? "blue";
    toneIndex += 1;
    return tone;
  };

  for (const change of body.changes) {
    if (highlights.length >= limit) {
      break;
    }
    highlights.push(highlightFromChange(change, nextTone()));
  }

  for (const fact of body.importantFacts) {
    if (highlights.length >= limit) {
      break;
    }
    if (highlights.some((row) => row.id === fact.claimRef.fieldKey)) {
      continue;
    }
    highlights.push(highlightFromFact(fact, nextTone()));
  }

  for (const question of body.openQuestions) {
    if (highlights.length >= limit) {
      break;
    }
    highlights.push(highlightFromQuestion(question, nextTone()));
  }

  return highlights;
}

export function buildCanonicalStudyOverviewParagraph(
  body: CanonicalStudyReportCustomerBody,
  maxSentences = 3,
): string {
  const sentences: string[] = [];
  for (const fact of body.importantFacts) {
    const text = fact.displayText.trim();
    if (text.length > 0 && !sentences.includes(text)) {
      sentences.push(text);
    }
    if (sentences.length >= maxSentences) {
      break;
    }
  }

  if (sentences.length === 0) {
    for (const section of body.storySections) {
      for (const fact of section.facts) {
        const text = fact.displayText.trim();
        if (text.length > 0 && !sentences.includes(text)) {
          sentences.push(text);
        }
        if (sentences.length >= maxSentences) {
          break;
        }
      }
      if (sentences.length >= maxSentences) {
        break;
      }
    }
  }

  return sentences.join(" ");
}

export function buildCanonicalStudyReadyHeadline(subjectFirstName: string | null | undefined): string {
  const trimmed = subjectFirstName?.trim();
  if (trimmed) {
    return `${trimmed}'s study overview`;
  }
  return "Your study overview";
}
