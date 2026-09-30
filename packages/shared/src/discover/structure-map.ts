import type { DiscoverDomainResolutionStatus } from "./proposal";
import type { DiscoverRelationshipKind } from "./proposal";

export const HIVE_STRUCTURE_MAP_SCHEMA = "hive-structure-map/1" as const;

export type StructureMapLogicalDocument = {
  id: string;
  domainId: string;
  sourceDocumentId: string;
  pageStart: number;
  pageEnd?: number;
  documentType: string;
  title: string;
  documentDate?: string;
  familyRole: string;
  groupId: string;
  recognitionStatus: "recognized" | "ambiguous" | "unrecognized" | "proposed_type";
  sequenceOrder?: number;
  provenance: "UPLOADED_EVIDENCE";
};

export type StructureMapRelationship = {
  id: string;
  fromLogicalDocumentId: string;
  toLogicalDocumentId: string;
  kind: DiscoverRelationshipKind;
  label?: string;
};

export type StructureMapCustomerAssertionRef = {
  questionId: string;
  evidenceKind: "CUSTOMER_ASSERTION";
  answeredAt: string;
  userId: string;
};

export type PackExpectationRequirementClass =
  | "REQUIRED"
  | "EXPECTED"
  | "CONDITIONAL"
  | "OPTIONAL";

export type StructureMapCompletenessExpectation = {
  packExpectationId: string;
  requirementClass: PackExpectationRequirementClass;
  expectedDocumentType: string;
  state: "SATISFIED" | "MISSING" | "DISPOSITIONED" | "NOT_APPLICABLE";
  disposition?: "UPLOAD" | "I_DONT_HAVE_IT" | "NOT_APPLICABLE";
};

export type StructureMapCompleteness = {
  status: "complete" | "missing_evidence" | "blocked_unresolved_structure";
  expectations: StructureMapCompletenessExpectation[];
};

export type StructureMapUnresolved = {
  code: string;
  severity: "blocking" | "informational";
  message: string;
  relatedLogicalDocumentIds?: string[];
};

/** Logical category kept inside a domain group. Never a separate domain. */
export type StructureMapDocumentCategory = {
  id: string;
  logicalDocumentIds: string[];
  description: string;
};

export type StructureMapDomainGroup = {
  id: string;
  domainId: string;
  domainLabel: string;
  logicalDocumentIds: string[];
  description: string;
  documentCategories?: StructureMapDocumentCategory[];
  completeness: StructureMapCompleteness;
};

export type StructureMap = {
  schemaVersion: typeof HIVE_STRUCTURE_MAP_SCHEMA;
  discoverRunId: string;
  caseId: string;
  producedAt: string;
  domainResolution: {
    status: DiscoverDomainResolutionStatus;
    domainLabel: string;
    domainId: string;
    domainPackId: string;
    domainPackVersion: string;
    candidateDomainLabels?: string[];
  };
  domainGroups?: StructureMapDomainGroup[];
  sourceDocuments: Array<{
    sourceDocumentId: string;
    originalFilename: string;
    sizeBytes: number;
    sha256?: string;
  }>;
  logicalDocuments: StructureMapLogicalDocument[];
  relationships: StructureMapRelationship[];
  chronology: Array<{
    logicalDocumentId: string;
    orderingKey: string;
    source: "MODEL" | "PACK" | "RESOLVED_ASSERTION";
  }>;
  discoveryAnswers: StructureMapCustomerAssertionRef[];
  unresolved: StructureMapUnresolved[];
  completeness: StructureMapCompleteness;
  provenance: {
    promptVersion: string;
    promptSha256: string;
    providerId: string;
    modelId?: string;
    resolutionPromptVersion?: string;
    resolutionPromptSha256?: string;
  };
};
