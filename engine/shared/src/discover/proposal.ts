export const HIVE_DISCOVER_PROPOSAL_SCHEMA = "hive-discover-proposal/1" as const;



export type DiscoverDomainResolutionStatus =

  | "SINGLE_DOMAIN"

  | "RESOLVED"

  | "AMBIGUOUS"

  | "MULTI_DOMAIN";



/** Pack-recognized type vs model-proposed label when vocabulary is incomplete. */

export type DiscoverRecognitionStatus =

  | "recognized"

  | "ambiguous"

  | "unrecognized"

  | "proposed_type";



export type DiscoverRelationshipKind =

  | "precedes"

  | "supports"

  | "same_sequence"

  | "related";



export type ProposedDomainResolution = {

  status: DiscoverDomainResolutionStatus;

  domainLabel: string;

  candidateDomainLabels?: string[];

};



export type ProposedLogicalDocument = {

  id: string;

  /** Stable domain id from Domain Pack vocabulary (v2 proposals). */

  domainId?: string;

  sourceDocumentId: string;

  pageStart: number;

  pageEnd?: number;

  documentType: string;

  title: string;

  documentDate?: string;

  familyRole: string;

  groupId: string;

  recognitionStatus: DiscoverRecognitionStatus;

  sequenceOrder?: number;

};



export type ProposedDiscoverRelationship = {

  id: string;

  fromLogicalDocumentId: string;

  toLogicalDocumentId: string;

  kind: DiscoverRelationshipKind;

  label?: string;

};



export type ProposedMissingExpectedDocument = {

  id: string;

  packExpectationId: string;

  expectedDocumentType: string;

  familyRole: string;

  groupId: string;

  reasonExpected: string;

  sequenceOrder?: number;

};



export type HiveDiscoverProposalV1 = {

  schemaVersion: typeof HIVE_DISCOVER_PROPOSAL_SCHEMA;

  domainResolution: ProposedDomainResolution;

  logicalDocuments: ProposedLogicalDocument[];

  relationships: ProposedDiscoverRelationship[];

  missingExpectedDocuments: ProposedMissingExpectedDocument[];

};

