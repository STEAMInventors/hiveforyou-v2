import type { DiscoverAmbiguityKind } from "./proposal-v2";

export type DiscoverAmbiguityResolvableBy =
  | "UPLOADED_EVIDENCE"
  | "PACK_RULE"
  | "DETERMINISTIC_VALIDATION"
  | "CUSTOMER_ASSERTION"
  | "NONE";

export type AssessedAmbiguity = {
  ambiguityKey: string;
  candidateId: string;
  kind: DiscoverAmbiguityKind;
  relatedLogicalDocumentIds: string[];
  materialityReason: string;
  resolvableBy: DiscoverAmbiguityResolvableBy[];
  consequential: boolean;
};

export type DiscoveryAssessment = {
  schemaVersion: "hive-discovery-assessment/1";
  assessedAt: string;
  consequential: AssessedAmbiguity[];
  suppressed: AssessedAmbiguity[];
};
