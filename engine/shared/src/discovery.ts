/** Engine 1 document-discovery snapshot (shared contract). */

export type RecognitionStatus = "recognized" | "ambiguous" | "unrecognized" | "proposed_type";

export type DocumentDiscoveryGroup = {
  id: string;
  label: string;
  description?: string;
  sequenceOrder: number;
  defaultCollapsed?: boolean;
};

export type DocumentDiscoveryDocument = {
  id: string;
  stagedDocumentId?: string;
  documentType: string;
  title: string;
  documentDate?: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount?: number;
  familyRole: string;
  sequenceOrder?: number;
  groupId: string;
  recognitionStatus: RecognitionStatus;
};

export type DocumentDiscoveryRelationship = {
  id: string;
  fromDocumentId: string;
  toDocumentId: string;
  kind: "precedes" | "supports" | "same_sequence" | "related";
  label?: string;
};

export type MissingExpectedDocument = {
  id: string;
  expectedDocumentType: string;
  familyRole: string;
  groupId: string;
  reasonExpected: string;
  sequenceOrder?: number;
};

export type DocumentDiscoveryDomainSection = {
  domainId: string;
  domainLabel: string;
  description?: string;
  groups: DocumentDiscoveryGroup[];
  /** Logical categories inside this domain (evaluations, planning, and so on). */
  documentCategories?: Array<{
    id: string;
    logicalDocumentIds: string[];
    description: string;
  }>;
  documents: DocumentDiscoveryDocument[];
  missingDocuments: MissingExpectedDocument[];
};

export type DocumentDiscoveryResult = {
  domainLabel: string;
  domainResolutionStatus: "resolved" | "provisional";
  groups: DocumentDiscoveryGroup[];
  documents: DocumentDiscoveryDocument[];
  relationships: DocumentDiscoveryRelationship[];
  missingDocuments: MissingExpectedDocument[];
  /** Present when multiple domains were organized independently. */
  domainSections?: DocumentDiscoveryDomainSection[];
};
