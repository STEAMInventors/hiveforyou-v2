export const DECLARATIVE_PACK_CONTRACT_VERSION = "domain-pack-declarative/0.2" as const;

export const SUPPORTED_DECLARATIVE_PRIMITIVES = [
  "matches",
  "missing",
  "series",
  "changed",
  "conflicts",
  "change",
  "conflict",
  "identity",
  "compose",
] as const;

export type DeclarativePackManifest = {
  id: string;
  name: string;
  packVersion: string;
  contractVersion: string;
  status: string;
  schemaSections: string[];
  additionalDefinitions?: string[];
};

export type DeclarativeFactType = {
  id: string;
  valueKind: string;
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
  semanticGuard?: Record<string, unknown>;
};

export type DeclarativeDocumentType = {
  id: string;
  label?: string;
  family?: string;
  subtypes?: string[];
  recognitionHints?: string[];
  checklist: Array<{
    factTypeId: string;
    mode?: string;
    repeatable?: boolean;
  }>;
  allowAdditionalPackFacts?: boolean;
};

export type DeclarativeRelationship = {
  id: string;
  from: string[];
  to: string[];
  primitive: string;
  require?: string[];
  onUncertain?: string;
};

export type DeclarativeInsightCheck = {
  id: string;
  primitive: string;
  inputs: string[];
  preconditions?: string[];
  unknownOutcome: string;
  failedParserOutcome?: string;
  questionTemplate: string;
  templateSlots?: unknown[];
  preconditionPolicy?: Record<string, unknown>;
  absenceRequiresCoverage?: boolean;
};

export type DeclarativePackRaw = {
  manifest: DeclarativePackManifest;
  audience: unknown;
  documentTypes: { documentTypes: DeclarativeDocumentType[] };
  factTypes: { factTypes: DeclarativeFactType[] };
  relationships: { relationships: DeclarativeRelationship[] };
  requirements: { requirements: unknown[] };
  insightChecks: { insightChecks: DeclarativeInsightCheck[] };
  readingNotes: {
    global: string[] | string;
    documentSpecific?: Record<string, string[]>;
  };
  vocabulary: unknown;
  plainExplainers: unknown;
  referenceTables: unknown;
};

export type DeclarativePackRegistration = {
  domainId: string;
  /** Directory containing manifest.json and section JSON files. */
  packRootRelative: string;
  /** When false, version is validated but never selected for new studies. */
  eligible: boolean;
  /** When true, prerelease semver tags (e.g. 0.2.1-draft) may win selection. */
  allowPrerelease?: boolean;
};

export type ResolvedDeclarativePack = {
  domainId: string;
  domainPackId: string;
  semanticVersion: string;
  packVersionLabel: string;
  packContractVersion: string;
  contentDigest: string;
  packRoot: string;
  raw: DeclarativePackRaw;
};
