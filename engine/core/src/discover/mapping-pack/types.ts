import type { MappingPackPin } from "@hiveforyou/domain-packs/mapping-pack";
import type { HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";

export type MappingPackDiscoverView = {
  schemaVersion: string;
  packPin: MappingPackPin;
  domainId: string;
  documentTypes: string[];
  groups: import("@hiveforyou/shared/discovery").DocumentDiscoveryGroup[];
  familyRoles: string[];
  relationshipKinds: import("@hiveforyou/domain-pack").DiscoverRelationshipKind[];
  recognitionHints: Record<string, string[]>;
  missingRequiredDefinitions: string[];
  /** Document profile id → checklist concept ids (source/concept mapping surface). */
  documentProfileConceptMappings?: Record<string, string[]>;
};

export type DiscoverMappingPackContext = {
  pin: MappingPackPin;
  discoverView: MappingPackDiscoverView;
  packSnapshot: import("@hiveforyou/domain-packs").DiscoverDomainPackSnapshot;
};

export type DiscoverClassificationDisposition = "accepted" | "rejected" | "unresolved";

export type DiscoverLogicalDocumentClassification = {
  logicalDocumentId: string;
  sourceDocumentId: string;
  pageStart: number;
  pageEnd?: number;
  proposedDocumentType: string;
  disposition: DiscoverClassificationDisposition;
  recognitionStatus?: string;
  reason?: string;
};

export type DiscoverPackComplianceResult = {
  schemaVersion: "hive.discover-pack-compliance/1";
  packPin: MappingPackPin;
  definitionsApplied: {
    documentTypes: string[];
    recognitionHints: Record<string, string[]>;
    documentProfileConceptMappings: Record<string, string[]>;
  };
  proposedDocumentTypes: string[];
  classifications: DiscoverLogicalDocumentClassification[];
  validation: HiveDiscoverValidationResult;
};

export type DiscoverMappingPackValidationOutcome = {
  validation: HiveDiscoverValidationResult;
  compliance: DiscoverPackComplianceResult;
};
