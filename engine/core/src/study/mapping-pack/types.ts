import type { MappingPackPin } from "@hiveforyou/domain-packs/mapping-pack";
import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import type { CompilePackDrivenReaderPromptResult } from "@hiveforyou/domain-pack/pack-driven-reader";

export type MappingPackReaderView = {
  schemaVersion: string;
  packPin: MappingPackPin;
  proposalManifest: ProposalDomainPack["manifest"];
  recordTypeCount: number;
  documentTypeCount: number;
  compiledProposalPack: ProposalDomainPack;
  /** Document profile id → checklist concept ids from §2 Document Profiles. */
  documentProfileConceptMappings: Record<string, string[]>;
};

export type ReaderMappingPackContext = {
  pin: MappingPackPin;
  readerView: MappingPackReaderView;
  proposalPack: ProposalDomainPack;
};

export type ReaderQualificationLogicalDocument = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  pageStart: number;
  pageEnd: number;
  discoverDocumentTypeLabel: string;
};

export type ReaderFactDisposition = "accepted" | "rejected" | "unresolved";

export type ReaderPackComplianceFactRow = {
  fieldKey: string;
  sourceDocumentId: string;
  logicalDocumentId: string;
  recordTypeId: string;
  fieldId: string;
  documentTypeId: string | null;
  disposition: ReaderFactDisposition;
  reasonCodes: string[];
  evidence?: {
    sourceDocumentId: string;
    page: number;
    quote: string;
  };
  packPin: MappingPackPin;
};

export type ReaderCoverageGap = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  documentTypeId: string;
  recordTypeId: string;
  fieldId: string;
  note: string;
};

export type ReaderDocumentQualificationTrace = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  discoverDocumentTypeLabel: string;
  resolvedDocumentTypeId: string;
  documentProfileId: string | null;
  conceptMappingsApplied: string[];
  prompt: Pick<
    CompilePackDrivenReaderPromptResult,
    "promptVersion" | "packId" | "packVersion" | "packContentSha256"
  >;
  inputArtifactRef: string;
  outputArtifactRef: string;
  rawModelJsonPreserved: boolean;
};

export type ReaderPackComplianceResult = {
  schemaVersion: "hive.reader-pack-compliance/1";
  packPin: MappingPackPin;
  documents: ReaderDocumentQualificationTrace[];
  facts: ReaderPackComplianceFactRow[];
  counts: {
    proposed: number;
    accepted: number;
    rejected: number;
    unresolved: number;
  };
  coverageGaps: ReaderCoverageGap[];
  unexpectedSourceSupported: ReaderPackComplianceFactRow[];
  validationOk: boolean;
  issues: Array<{ code: string; message: string }>;
};

export type ReaderMappingPackValidationOutcome = {
  compliance: ReaderPackComplianceResult;
};
