import type { StudyRawExtractionOutcome } from "@hiveforyou/core";
import { isStudyRunProcessing, type StudyRunStatus } from "@hiveforyou/shared/canonical-study";

import type { CustomerExtractionDocumentRow } from "./map-customer-extraction-ui-state";
import { isPackDrivenExtractionExploreReady } from "./map-customer-extraction-ui-state";

export function countCustomerDocumentUiStatuses(
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[],
): {
  readCount: number;
  failedCount: number;
  processingCount: number;
} {
  let readCount = 0;
  let failedCount = 0;
  let processingCount = 0;
  for (const row of documents) {
    if (row.uiStatus === "read") {
      readCount += 1;
    } else if (row.uiStatus === "failed" || row.uiStatus === "needs_review") {
      failedCount += 1;
    } else if (row.uiStatus === "waiting" || row.uiStatus === "reading") {
      processingCount += 1;
    }
  }
  return { readCount, failedCount, processingCount };
}

export function inferRawExtractionOutcomeFromDocuments(input: {
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[];
  studyRunStatus: StudyRunStatus;
}): StudyRawExtractionOutcome | null {
  if (isStudyRunProcessing(input.studyRunStatus)) {
    return null;
  }
  if (input.documents.length === 0) {
    return null;
  }
  const { readCount, failedCount, processingCount } = countCustomerDocumentUiStatuses(
    input.documents,
  );
  if (processingCount > 0) {
    return null;
  }
  if (readCount > 0 && failedCount === 0) {
    return "succeeded";
  }
  if (readCount > 0 && failedCount > 0) {
    return "partial_failure";
  }
  if (failedCount > 0) {
    return "failed";
  }
  return null;
}

export function resolveEffectiveRawExtractionOutcome(input: {
  artifactOutcome: StudyRawExtractionOutcome | null;
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[];
  studyRunStatus: StudyRunStatus;
}): StudyRawExtractionOutcome | null {
  if (input.artifactOutcome) {
    return input.artifactOutcome;
  }
  return inferRawExtractionOutcomeFromDocuments({
    documents: input.documents,
    studyRunStatus: input.studyRunStatus,
  });
}

export function resolveExtractionTerminal(input: {
  rawExtractionOutcome: StudyRawExtractionOutcome | null;
  studyRunStatus: StudyRunStatus;
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[];
}): boolean {
  if (input.rawExtractionOutcome !== null) {
    return true;
  }
  if (isStudyRunProcessing(input.studyRunStatus)) {
    return false;
  }
  if (
    input.studyRunStatus === "FAILED" ||
    input.studyRunStatus === "SUCCEEDED" ||
    input.studyRunStatus === "NEEDS_REVIEW"
  ) {
    return true;
  }
  const { processingCount } = countCustomerDocumentUiStatuses(input.documents);
  return input.documents.length > 0 && processingCount === 0;
}

export function shouldShowGenericExtractionFailure(input: {
  extractionTerminal: boolean;
  extractionCompleteForExplore: boolean;
  rawExtractionOutcome: StudyRawExtractionOutcome | null;
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[];
}): boolean {
  if (!input.extractionTerminal || input.extractionCompleteForExplore) {
    return false;
  }
  const { readCount, failedCount } = countCustomerDocumentUiStatuses(input.documents);
  if (readCount > 0) {
    return false;
  }
  if (failedCount > 0) {
    return true;
  }
  return input.rawExtractionOutcome === "failed";
}

export function resolveExtractionCompleteForExplore(input: {
  rawExtractionOutcome: StudyRawExtractionOutcome | null;
  documents: readonly Pick<CustomerExtractionDocumentRow, "uiStatus">[];
}): boolean {
  return isPackDrivenExtractionExploreReady(input.rawExtractionOutcome, input.documents);
}

export type HiveExtractionProgressView = {
  caseId: string;
  studyRunId: string;
  intakeRunId: string | null;
  studyRunStatus: StudyRunStatus;
  rawExtractionOutcome: "succeeded" | "partial_failure" | "failed" | null;
  extractionCompleteForExplore: boolean;
  extractionTerminal: boolean;
  subjectFirstName: string | null;
  documents: CustomerExtractionDocumentRow[];
  thingsThatWouldHelp: Array<{ customerLabel: string; packExpectationId: string }>;
  readDocumentCount: number;
  totalDetailCount: number;
};

export function shouldPollHiveExtractionProgress(
  progress: HiveExtractionProgressView | null,
): boolean {
  if (!progress) {
    return true;
  }
  if (progress.extractionCompleteForExplore) {
    return false;
  }
  if (progress.extractionTerminal) {
    return false;
  }
  return isStudyRunProcessing(progress.studyRunStatus);
}

export function customerExtractionShowsGenericFailure(
  progress: HiveExtractionProgressView | null | undefined,
): boolean {
  if (!progress) {
    return false;
  }
  return shouldShowGenericExtractionFailure({
    extractionTerminal: progress.extractionTerminal,
    extractionCompleteForExplore: progress.extractionCompleteForExplore,
    rawExtractionOutcome: progress.rawExtractionOutcome,
    documents: progress.documents,
  });
}
