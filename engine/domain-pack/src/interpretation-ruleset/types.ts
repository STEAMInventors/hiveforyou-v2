import type {
  ProposalDocumentType,
  ProposalDomainPack,
  ProposalInsightCheck,
  ProposalRecordField,
  ProposalRecordType,
} from "../pack-driven-reader/types.js";
import type { ProposalRelationshipRules } from "../pack-driven-reader/types.js";

export const INTERPRETATION_OVERLAY_SCHEMA_VERSION = "hive.domain-pack.interpretation-overlay/0.1" as const;

export type InterpretationDocumentTypePatch = {
  id: string;
  orderingDate?: ProposalDocumentType["orderingDate"];
  orderingDatePaths?: ProposalDocumentType["orderingDatePaths"];
};

export type InterpretationFieldDerivationPatch = {
  fieldId: string;
  derivation: NonNullable<ProposalRecordField["derivation"]>;
};

export type InterpretationRecordTypePatch = {
  id: string;
  identity?: ProposalRecordType["identity"];
  composition?: ProposalRecordType["composition"];
  fieldsAppend?: ProposalRecordType["fields"];
  fieldsReplace?: ProposalRecordType["fields"];
  fieldDerivationPatches?: InterpretationFieldDerivationPatch[];
};

export type InterpretationOverlay = {
  schemaVersion: typeof INTERPRETATION_OVERLAY_SCHEMA_VERSION;
  manifest: {
    id: string;
    version: string;
    name?: string;
  };
  compatibleReaderPackContentSha256: string[];
  relationshipRules?: ProposalRelationshipRules;
  recordTypePatches?: InterpretationRecordTypePatch[];
  documentTypePatches?: InterpretationDocumentTypePatch[];
  insightCheckReplacements?: ProposalInsightCheck[];
  vocabulary?: ProposalDomainPack["vocabulary"];
  seriesObservationDateFieldIds?: ProposalDomainPack["seriesObservationDateFieldIds"];
  compositionRules?: ProposalDomainPack["compositionRules"];
};
