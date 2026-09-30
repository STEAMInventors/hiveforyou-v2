/** Engine 1 document-discovery model — document-level metadata only. */

export type RecognitionStatus = "recognized" | "ambiguous" | "unrecognized" | "proposed_type";

export function customerRecognitionLabel(status: RecognitionStatus): string {
  if (status === "recognized") {
    return "Recognized";
  }
  if (status === "ambiguous") {
    return "Needs clarification";
  }
  if (status === "proposed_type") {
    return "Not a standard type";
  }
  return "Unrecognized";
}

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

export type DocumentRelationshipKind =
  | "precedes"
  | "supports"
  | "same_sequence"
  | "related";

export type DocumentDiscoveryRelationship = {
  id: string;
  fromDocumentId: string;
  toDocumentId: string;
  kind: DocumentRelationshipKind;
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

export type DomainResolutionStatus = "resolved" | "provisional";

export type DocumentDiscoveryDomainSection = {
  domainId: string;
  domainLabel: string;
  description?: string;
  groups: DocumentDiscoveryGroup[];
  documents: DocumentDiscoveryDocument[];
  missingDocuments: MissingExpectedDocument[];
};

export type DocumentDiscoveryResult = {
  domainLabel: string;
  domainResolutionStatus: DomainResolutionStatus;
  groups: DocumentDiscoveryGroup[];
  documents: DocumentDiscoveryDocument[];
  relationships: DocumentDiscoveryRelationship[];
  missingDocuments: MissingExpectedDocument[];
  domainSections?: DocumentDiscoveryDomainSection[];
};

export type DocumentInspectorSelection =
  | { kind: "document"; documentId: string }
  | { kind: "missing"; missingDocumentId: string }
  | null;
