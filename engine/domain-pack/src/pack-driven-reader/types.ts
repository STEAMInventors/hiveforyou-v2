export type ProposalDomainPack = {
  schemaVersion: string;
  status?: string;
  manifest: {
    id: string;
    version: string;
    name?: string;
    jurisdictions?: string[];
  };
  documentTypes: ProposalDocumentType[];
  recordTypes: ProposalRecordType[];
  constructs?: Record<string, ProposalConstruct>;
  fieldSources?: Record<string, string>;
  modalities?: string[];
  missingStates?: string[];
  evidencePolicy?: Record<string, unknown>;
  unclassifiedPolicy?: string;
  /** Optional explicit generic checklist when type is unknown (proposal extension). */
  genericUnclassifiedChecklist?: string[];
  readingNotes: {
    global: string;
    byDocumentType: Record<string, string>;
    sizeLimitChars?: number;
  };
  vocabulary?: {
    abbreviations?: Record<string, string>;
    fieldSynonyms?: Array<{
      field: string;
      terms: string[];
      category?: string;
      value?: string;
    }>;
    /** Maps legacy reader enum values to normalized pack codes by field path or bare field id. */
    readerLegacyContextMap?: Record<string, Record<string, string>>;
    unitAliases?:
      | Record<string, string[]>
      | Array<{ canonical: string; aliases: string[] }>;
    easilyConfused?: Array<{ term: string; meaning: string }>;
    note?: string;
  };
  requirements?: ProposalRequirements;
  insightChecks?: ProposalInsightChecks;
  plainExplainers?: unknown;
  authorRoles?: ProposalAuthorRole[];
  /** Human-readable policy text (review). Prefer relationshipRules for engine behavior. */
  authorPartyPolicy?: string;
  /** Declarative relationship labeling rules — no domain-specific branches in Core. */
  relationshipRules?: ProposalRelationshipRules;
  /** Declarative amendment composition rules — document/record types from pack only. */
  compositionRules?: ProposalCompositionRule[];
  /**
   * Record-local field ids tried in order when inferring series observation dates.
   * Falls back to document ordering date only when seriesOrderingDateFallback is true.
   */
  seriesObservationDateFieldIds?: string[];
  /** When false (default), missing semantic observation dates stay unresolved — no orderingDate substitute. */
  seriesOrderingDateFallback?: boolean;
  referenceTables?: ProposalReferenceTables;
};

export type ProposalMatchingPolicyDimension =
  | "construct"
  | "unit"
  | "temporal"
  | "context"
  | "subject";

export type ProposalMatchingPolicy = {
  requiredDimensions?: ProposalMatchingPolicyDimension[];
};

export type ProposalSeriesRestatementPolicy = {
  /** Verified field ids that must align to collapse observations (e.g. observed_on). */
  eventIdentityFieldIds?: string[];
  /** When true, a verified MATCHES/restatement cluster may corroborate observations. */
  allowExplicitRestatementCorroboration?: boolean;
};

export type ProposalRelationshipRules = {
  /** CHANGE requires verified temporal succession, not document ordering date alone. */
  changeRequiresTemporalSuccession?: boolean;
  /** Field ids on records used to establish event/effective chronology (record-local ids). */
  temporalSuccessionFieldIds?: string[];
  /** Different parties on the same comparable slot without succession => CONFLICT. */
  conflictWhenDifferentParties?: boolean;
  /** UNCHANGED across documents requires verified logical succession, not sort order alone. */
  unchangedRequiresLogicalSuccession?: boolean;
  /** Per field id matching eligibility (record-local field ids). */
  matchingPolicyByFieldId?: Record<string, ProposalMatchingPolicy>;
};

export type ProposalConstruct = {
  description?: string;
  requiredFields?: string[];
  comparedIfBothPresent?: string[];
  normalize?: string[];
  onPartialMatch?: string;
  seriesRestatementPolicy?: ProposalSeriesRestatementPolicy;
};

export type ProposalCompositionRule = {
  id: string;
  amendmentDocumentTypeId: string;
  baseDocumentTypeId: string;
  changeRecordTypeId: string;
  /** Field on the change record holding the affected record type id (classified/quoted). */
  affectedRecordTypeFieldId: string;
  /** Field on the change record whose verified date links the amendment to a base document ordering date. */
  amendmentTargetDateFieldId?: string;
  overlayMode: "replace_by_content_key";
};

export type ProposalReferenceTables = {
  entries?: Array<{
    id: string;
    rows?: unknown[];
    status?: string;
  }>;
};

export type ProposalRequirements = {
  rules?: ProposalRequirementRule[];
};

export type ProposalRequirementRule = {
  id: string;
  appliesTo?: string;
  checks?: ProposalRequirementCheck[];
  when?: ProposalRequirementWhen;
  description?: string;
  status?: string;
};

export type ProposalRequirementCheck = {
  record: string;
  fields?: string[];
  minCount?: number;
  forEach?: boolean;
  /**
   * Optional page phrases. Absence is declared only after these phrases are
   * checked against trusted pages. A page hit without a verified field stays unresolved.
   */
  pageTerms?: string[];
};

export type ProposalRequirementWhen = {
  primitive: string;
  record?: string;
  field?: string;
  equals?: unknown;
  birthDate?: string;
  onDate?: string;
  atLeast?: number;
  atLeastFromReference?: string;
  offsetYears?: number;
};

export type ProposalInsightChecks = {
  enginePrimitivesRequired?: string[];
  checks?: ProposalInsightCheck[];
};

export type ProposalInsightCheck = {
  id: string;
  primitive: string;
  question?: string;
  fires?: string;
  left?: ProposalInsightOperand;
  right?: ProposalInsightOperand;
  present?: ProposalInsightOperand;
  absent?: ProposalInsightOperand;
  joinOn?: string;
  [key: string]: unknown;
};

export type ProposalInsightOperand = {
  record?: string;
  field?: string;
  unitField?: string;
  scope?: string;
  where?: Record<string, unknown>;
  pick?: string;
  [key: string]: unknown;
};

export type ProposalAuthorRole = {
  id: string;
  party: string;
};

export type ProposalDocumentType = {
  id: string;
  label?: string;
  /** Engine 1 / Discover vocabulary strings that map to this stable document type id. */
  discoverLabels?: string[];
  authorRole?: string;
  checklist: string[];
  checklistPolicy?: string;
  orderingDate?: string;
  orderingDatePaths?: string[];
  classificationPolicy?: string;
  amends?: string;
  documentLinks?: string[];
};

export type ProposalRecordType = {
  id: string;
  label?: string;
  group?: string;
  repeatable?: boolean;
  identity?: {
    scope?: string;
    keyFields?: string[];
    keyFieldsIfPresent?: string[];
    disambiguators?: string[];
    versionAxis?: string;
    /**
     * When keyFields is empty and scope is case-wide: merge singleton versions only when
     * explicitly guaranteed_unique. Conflicting non-key fields stay visible on that entity.
     * Uncertain identities stay unmerged.
     */
    caseSingletonMerge?: "guaranteed_unique" | "never_auto_merge";
    /**
     * Verified fields that must agree for case singleton merge; conflict blocks merge.
     */
    strongIdentifierFieldIds?: string[];
    /** Minimum verified identity fields required before case singleton merge is allowed. */
    identityEvidenceFieldIds?: string[];
    /** Field ids used to build occurrence anchor keys before evidence quotes. */
    occurrenceAnchorFieldIds?: string[];
    /**
     * version: same content key across documents is one versioned entity.
     * independent_assertions: same-period records stay separate corroborating assertions.
     */
    crossDocumentMerge?: "version" | "independent_assertions";
  };
  /** Declarative composition role for amendment overlay (pack-defined record type). */
  composition?: {
    role: "amendment_change";
    overlayMode: "replace_by_content_key";
    affectedRecordTypeFieldId: string;
    amendmentTargetDateFieldId?: string;
  };
  fields: ProposalRecordField[];
  usesConstructs?: string[];
};

export type ProposalRecordField = {
  id: string;
  valueKind: string;
  source: string[];
  modality?: string[];
  enum?: string[];
  unit?: string;
  description?: string;
  /** none skips change/conflict comparison. value compares the normalized value. event uses verified event chronology. */
  comparison?: "none" | "value" | "event";
  derivation?: {
    primitive: string;
    operands: string[];
    condition?: string;
    alternates?: Array<{
      primitive: string;
      operands: string[];
    }>;
  };
};

export type CaseDocumentManifestEntry = {
  sourceDocumentId: string;
  filename?: string;
  pageCount?: number;
  logicalDocumentId?: string;
  /** Advisory Discover classification label (human/discover vocabulary). */
  discoverDocumentTypeLabel?: string | null;
  /** Advisory Discover classification resolved to a pack documentTypeId when unambiguous. */
  discoverDocumentTypeId?: string | null;
};

export type PackDrivenDocumentPage = {
  pageNumber: number;
  text: string;
};

export type PackDrivenSingleDocumentInput = {
  sourceDocumentId: string;
  pages: PackDrivenDocumentPage[];
};

export type ChecklistCoverageDisposition =
  | "extracted"
  | "not_found"
  | "not_applicable"
  | "unresolved";

export type ChecklistCoverageItem = {
  recordTypeId: string;
  disposition: ChecklistCoverageDisposition;
  instanceIndexes?: number[];
  note?: string | null;
};

export type CompilePackDrivenReaderPromptInput = {
  pack: ProposalDomainPack;
  caseManifest: CaseDocumentManifestEntry[];
  document: PackDrivenSingleDocumentInput;
  /** Include optional provider cache hint metadata (does not affect prompt text). */
  emitCacheBoundaryHints?: boolean;
};

export type SelectedRecordDefinition = {
  recordTypeId: string;
  label?: string;
  repeatable: boolean;
  identity?: ProposalRecordType["identity"];
  fields: ProposalRecordField[];
  usesConstructs?: string[];
};

export type CompilePackDrivenReaderPromptResult = {
  promptVersion: string;
  packId: string;
  packVersion: string;
  packContentSha256: string;
  packDocumentTypeCount: number;
  packRecordTypeCount: number;
  stableSystemPrefix: string;
  caseUserContent: string;
  outputJsonSchema: Record<string, unknown>;
  cacheBoundaryHints?: {
    stablePrefixEndsAfterBlock: "B";
    variableUserBlocks: Array<"C" | "D" | "E" | "F">;
  };
  blocks: {
    A_universal: string;
    B_packDefinitionAndContract: string;
    C_caseManifest: string;
    D_documentTask: string;
    E_documentPages: string;
    F_outputContract: string;
  };
};
