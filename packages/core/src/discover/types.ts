import type { SourceDocumentRecord } from "../persistence/source-document-repository";

export type DiscoverSourceDocumentInput = {
  sourceDocumentId: string;
  originalFilename: string;
  mimeType?: string | null;
  sizeBytes: number;
};

import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { CustomerDiscoveryAnswer } from "@hiveforyou/shared/discover";

import type { MissingEvidenceDisposition } from "./check-pack-completeness";

export type DiscoverEnginePhase = "collection_understanding" | "discovery_completion";

export type RunDiscoverRequest = {
  caseId: string;
  sourceDocumentIds: string[];
  intakeRunId?: string | null;
  discoverRunId?: string;
  customerAnswers?: CustomerDiscoveryAnswer[];
  caseCustomerContextIntake?: CaseCustomerContextIntake;
  missingEvidenceDispositions?: MissingEvidenceDisposition[];
};

export function toDiscoverSourceInput(
  record: SourceDocumentRecord,
): DiscoverSourceDocumentInput {
  return {
    sourceDocumentId: record.id,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
  };
}
