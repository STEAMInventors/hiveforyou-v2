import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";

import type { CustomerExtractionDocumentRow } from "./map-customer-extraction-ui-state";

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
