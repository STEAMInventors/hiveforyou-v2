import type { EvidenceReference } from "../canonical-study/proposal";

export const CASE_PROVENANCE_BUNDLE_SCHEMA = "case-provenance-bundle/1" as const;

export type ResolvedEvidenceRef = EvidenceReference & {
  logicalTitle?: string;
  logicalDocumentType?: string;
  logicalDomainId?: string;
  sourceFilename?: string;
  sha256?: string;
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
