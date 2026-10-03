import type { EvidenceReference } from "../canonical-study/proposal";

export const CASE_PROVENANCE_BUNDLE_SCHEMA = "case-provenance-bundle/1" as const;

export const EVIDENCE_PROVENANCE_RESOLUTIONS = ["EXACT", "PARTIAL", "UNRESOLVED"] as const;

export type EvidenceProvenanceResolution = (typeof EVIDENCE_PROVENANCE_RESOLUTIONS)[number];

export type ResolvedEvidenceSpan = {
  start: number;
  end: number;
};

export type ResolvedEvidenceRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Coordinate system of persisted NestIEP / normalized extraction geometry. */
  coordinateSpace: "source-document-page";
};

export type ResolvedEvidenceRef = EvidenceReference & {
  logicalTitle?: string;
  logicalDocumentType?: string;
  logicalDomainId?: string;
  sourceFilename?: string;
  sha256?: string;
  /** Populated by exact evidence trace resolution (API / server resolver). */
  evidenceRefId?: string;
  claimId?: string;
  physicalPageNumber?: number;
  logicalPageNumber?: number;
  canonicalTextSnippet?: string;
  span?: ResolvedEvidenceSpan;
  region?: ResolvedEvidenceRegion;
  lineOrder?: number;
  blockIndex?: number;
  extractionMethod?: string;
  resolution?: EvidenceProvenanceResolution;
  resolutionIssues?: string[];
};

export type CaseProvenanceClaimSummary = {
  claimId: string;
  /** Document-backed refs only — suitable for evidence chips in Customer UI. */
  documentEvidence: ResolvedEvidenceRef[];
};

export type CaseProvenanceBundle = {
  schemaVersion: typeof CASE_PROVENANCE_BUNDLE_SCHEMA;
  caseId: string;
  intelligenceVersion: number;
  claims: CaseProvenanceClaimSummary[];
};
