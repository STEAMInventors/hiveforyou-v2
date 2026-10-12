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
    fieldSynonyms?: Array<{ field: string; synonyms: string[] }>;
    unitAliases?:
      | Record<string, string[]>
      | Array<{ canonical: string; aliases: string[] }>;
    easilyConfused?: Array<{ term: string; meaning: string }>;
    note?: string;
  };
  requirements?: unknown;
  insightChecks?: unknown;
  plainExplainers?: unknown;
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
  classificationPolicy?: string;
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
  derivation?: {
    primitive: string;
    operands: string[];
    condition?: string;
  };
};

export type ProposalConstruct = {
  description?: string;
  requiredFields?: string[];
  comparedIfBothPresent?: string[];
};

export type CaseDocumentManifestEntry = {
  sourceDocumentId: string;
  filename?: string;
  pageCount?: number;
  logicalDocumentId?: string;
  documentTypeId?: string | null;
};

export type PackDrivenDocumentPage = {
  pageNumber: number;
  text: string;
};

export type PackDrivenSingleDocumentInput = {
  sourceDocumentId: string;
  pages: PackDrivenDocumentPage[];
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
    variableUserBlocks: Array<"C" | "D" | "E">;
  };
  blocks: {
    A_universal: string;
    B_packDefinitionAndContract: string;
    C_caseManifest: string;
    D_documentTask: string;
    E_documentPages: string;
  };
};
