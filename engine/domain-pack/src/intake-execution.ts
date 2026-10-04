import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";
import type { DocumentIdentityType } from "@hiveforyou/shared/intake";

import type { DiscoverMissingExpectation } from "./types";
import type { PacketSegmentationResolver } from "./logical-page-segmentation";

export const INTAKE_PACK_EXECUTION_SCHEMA_VERSION = "intake-pack-execution/1" as const;

export type IntakePackProcessingDisposition = "PROCESS" | "NEEDS_REVIEW" | "DO_NOT_PROCESS";

export type IntakePackLogicalDocument = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  pageStart: number;
  pageEnd: number;
  documentFamily: string;
  documentSubtype: string | null;
  processingDisposition: IntakePackProcessingDisposition;
  classificationConfidence: number;
  classificationReason: string;
  customerLabel: string;
  /** Authoritative document date (YYYY-MM-DD) when the pack resolved one. */
  documentDate?: string | null;
  /** prior | current | intermediate | sequence | draft | unknown, after the full set is classified. */
  temporalRole?: string | null;
  sourceFilename?: string | null;
};

export type IntakePackCompletenessExpectationState =
  | "SATISFIED"
  | "OPEN"
  | "DISPOSITIONED"
  | "NOT_APPLICABLE";

export type IntakePackCompletenessRow = {
  packExpectationId: string;
  requirementClass: string;
  expectedDocumentType: string;
  state: IntakePackCompletenessExpectationState;
  disposition?: "UPLOAD" | "I_DONT_HAVE_IT" | "NOT_APPLICABLE";
};

export type IntakePackExecutionResult = {
  schemaVersion: typeof INTAKE_PACK_EXECUTION_SCHEMA_VERSION;
  domainPackId: string;
  domainPackVersion: string;
  logicalDocuments: IntakePackLogicalDocument[];
  completeness: {
    expectations: IntakePackCompletenessRow[];
    collectionNeedsReview: boolean;
  };
};

export type IntakePackSourceDocument = {
  sourceDocumentId: string;
  filename: string;
  genericIdentity: DocumentIdentityType | null;
  normalized: NormalizedDocumentExtraction;
};

export type IntakePackDispositionInput = {
  packExpectationId: string;
  disposition: "UPLOAD" | "I_DONT_HAVE_IT" | "NOT_APPLICABLE" | "DISCARDED";
};

export type IntakePackCollectionInput = {
  domainPackId: string;
  domainPackVersion: string;
  documents: IntakePackSourceDocument[];
  missingExpectations: readonly DiscoverMissingExpectation[];
  dispositions?: readonly IntakePackDispositionInput[];
  /** Optional semantic boundary proposer; pack code validates before splitting. */
  packetSegmentationResolver?: PacketSegmentationResolver;
};

export type IntakeDomainPackExecutor = {
  domainId: string;
  execute(
    input: IntakePackCollectionInput,
  ): IntakePackExecutionResult | Promise<IntakePackExecutionResult>;
};
