export const MAPPING_PACK_CONTRACT_VERSION = "hive.domain-mapping-pack/1.0" as const;

export const MAPPING_PACK_SECTIONS = [
  "concepts",
  "documents",
  "relationships",
  "personas",
] as const;

export type MappingPackSection = (typeof MAPPING_PACK_SECTIONS)[number];

export type MappingPackManifest = {
  id: string;
  name: string;
  packVersion: string;
  contractVersion: string;
  status: string;
  schemaSections: MappingPackSection[];
};

export type MappingPackConcept = {
  id: string;
  canonicalTypeId?: string;
  valueKind: string;
  description?: string;
  allowedUnits?: string[];
  assertionSemantics?: string;
  evidencePolicy?: {
    allowedProvenance?: string[];
    quoteAndPageRequiredForQuoted?: boolean;
    classifiedIsNotVerifiedQuote?: boolean;
  };
  identity?: {
    keys?: string[];
    scope?: string[];
    onAmbiguity?: string;
    occurrenceAnchor?: string;
  };
  temporal?: Record<string, unknown>;
  multiplicity?: string;
};

export type MappingPackConceptSection = {
  version: string;
  concepts: MappingPackConcept[];
  referenceTables?: unknown;
  vocabulary?: unknown;
  conceptMappingPolicy?: {
    modelEmitsObservedPackFactTypeId?: string;
    legacyCanonicalConstructBridge?: string;
    unmappedLegacyFacts?: string;
    unexpectedSourceFacts?: string;
  };
};

export type MappingPackDocumentProfile = {
  id: string;
  label?: string;
  family?: string;
  subtypes?: string[];
  recognitionHints?: string[];
  checklist: Array<{
    conceptId: string;
    mode?: string;
    repeatable?: boolean;
  }>;
  allowAdditionalSourceFacts?: boolean;
  expectedSourceSections?: string[];
};

export type MappingPackDocumentsSection = {
  version: string;
  documentProfiles: MappingPackDocumentProfile[];
  globalReadingNotes?: string[] | string;
  documentReadingNotes?: Record<string, string[]>;
};

export type MappingPackRelationship = {
  id: string;
  from: string[];
  to: string[];
  primitive: string;
  require?: string[];
  onUncertain?: string;
};

export type MappingPackRelationshipsSection = {
  version: string;
  relationships: MappingPackRelationship[];
  insightChecks?: unknown[];
  requirements?: unknown[];
};

export type MappingPackPersona = {
  id: string;
  label?: string;
  objectives?: string[];
  contentRequirements?: string[];
  entitlementId?: string;
  readingLevel?: string;
  requiredViews?: string[];
  priorities?: string[];
};

export type MappingPackPersonasSection = {
  version: string;
  personas: MappingPackPersona[];
  plainExplainers?: unknown;
};

export type MappingPackCanonical = {
  manifest: MappingPackManifest;
  concepts: MappingPackConceptSection;
  documents: MappingPackDocumentsSection;
  relationships: MappingPackRelationshipsSection;
  personas: MappingPackPersonasSection;
};

export type MappingPackPin = {
  packId: string;
  packVersion: string;
  contractVersion: typeof MAPPING_PACK_CONTRACT_VERSION;
  contentDigest: string;
  domainId?: string;
  selection: "specialized" | "generic_fallback";
};

export type MappingPackStage =
  | "discover"
  | "reader"
  | "normalizer"
  | "reasoner"
  | "validator"
  | "writer"
  | "application";

export type MappingPackRegistration = {
  domainId: string;
  source: "native" | "declarative";
  packRootRelative: string;
  eligible: boolean;
  allowPrerelease?: boolean;
  /** When true, used only when no compatible specialized pack resolves. */
  isGenericFallback?: boolean;
};

export type ResolvedMappingPack = {
  pin: MappingPackPin;
  canonical: MappingPackCanonical;
  /** Present when source is declarative — enables legacy compilers without duplicating logic. */
  declarativeRaw?: import("../declarative/types.js").DeclarativePackRaw;
};

export type CompiledMappingPackStageViews = {
  pin: MappingPackPin;
  views: Record<
    MappingPackStage,
    {
      schemaVersion: string;
      packPin: MappingPackPin;
      [key: string]: unknown;
    }
  >;
};
