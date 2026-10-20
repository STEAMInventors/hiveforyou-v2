import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
} from "./constants.js";
import type { ProposalDomainPack } from "./types.js";

const EVIDENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceDocumentId", "page", "quote"],
  properties: {
    sourceDocumentId: { type: "string", minLength: 1 },
    page: { type: "integer", minimum: 1 },
    quote: { type: "string", minLength: 1 },
  },
} as const;

const FIELD_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fieldId", "provenance", "valueKind", "value", "modality", "missingState", "evidence"],
  properties: {
    fieldId: { type: "string", minLength: 1 },
    provenance: { type: "string", enum: ["quoted", "classified"] },
    valueKind: { type: "string" },
    value: {},
    modality: { type: "string" },
    missingState: {
      anyOf: [
        { type: "null" },
        {
          type: "string",
          enum: [
            "field_present_but_empty",
            "not_found_in_supplied_documents",
            "not_applicable",
            "unresolved",
          ],
        },
      ],
    },
    evidence: {
      anyOf: [EVIDENCE_SCHEMA, { type: "null" }],
    },
  },
} as const;

const CHECKLIST_COVERAGE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordTypeId", "disposition"],
  properties: {
    recordTypeId: { type: "string", minLength: 1 },
    disposition: {
      type: "string",
      enum: ["extracted", "not_found", "not_applicable", "unresolved"],
    },
    instanceIndexes: {
      type: "array",
      items: { type: "integer", minimum: 0 },
    },
    note: {
      anyOf: [{ type: "null" }, { type: "string" }],
    },
  },
} as const;

function documentTypeIdSchema(pack: ProposalDomainPack): Record<string, unknown> {
  const packIds = pack.documentTypes.map((d) => d.id);
  return {
    type: "string",
    enum: [...packIds, PACK_DRIVEN_CLASSIFICATION_UNKNOWN, PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS],
  };
}

function buildUniversalEnvelope(input: {
  pack: ProposalDomainPack;
  sourceDocumentId?: string;
}): Record<string, unknown> {
  const recordInstanceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["recordTypeId", "instanceIndex", "fields"],
    properties: {
      recordTypeId: { type: "string", minLength: 1 },
      instanceIndex: { type: "integer", minimum: 0 },
      recordEvidence: EVIDENCE_SCHEMA,
      fields: { type: "array", items: FIELD_EXTRACTION_SCHEMA },
    },
  };

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "packId",
      "packVersion",
      "documentTypeId",
      "sourceDocumentId",
      "checklistCoverage",
      "recordInstances",
    ],
    properties: {
      schemaVersion: { type: "string", const: PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION },
      packId: { type: "string", const: input.pack.manifest.id },
      packVersion: { type: "string", const: input.pack.manifest.version },
      documentTypeId: documentTypeIdSchema(input.pack),
      sourceDocumentId: input.sourceDocumentId
        ? { type: "string", const: input.sourceDocumentId }
        : { type: "string", minLength: 1 },
      checklistCoverage: {
        type: "array",
        items: CHECKLIST_COVERAGE_ITEM_SCHEMA,
      },
      recordInstances: { type: "array", items: recordInstanceSchema },
    },
    definitions: {
      evidence: EVIDENCE_SCHEMA,
      fieldExtraction: FIELD_EXTRACTION_SCHEMA,
      recordInstance: recordInstanceSchema,
      checklistCoverageItem: CHECKLIST_COVERAGE_ITEM_SCHEMA,
    },
  };
}

/** Universal output schema for self-classifying Reader (stable system prefix). */
export function buildUniversalPackDrivenReaderOutputJsonSchema(
  pack: ProposalDomainPack,
): Record<string, unknown> {
  return buildUniversalEnvelope({ pack });
}

/** @deprecated Use buildUniversalPackDrivenReaderOutputJsonSchema — per-document schema is universal. */
export function buildStablePackDrivenReaderOutputJsonSchema(input: {
  packId: string;
  packVersion: string;
}): Record<string, unknown> {
  void input;
  throw new Error(
    "buildStablePackDrivenReaderOutputJsonSchema requires full pack; use buildUniversalPackDrivenReaderOutputJsonSchema(pack)",
  );
}

/** Per-request schema copy with sourceDocumentId pinned when compiling a single document. */
export function buildPackDrivenReaderOutputJsonSchema(input: {
  pack: ProposalDomainPack;
  sourceDocumentId: string;
}): Record<string, unknown> {
  return buildUniversalEnvelope({
    pack: input.pack,
    sourceDocumentId: input.sourceDocumentId,
  });
}

export function summarizeOutputSchemaStructure(schema: Record<string, unknown>): {
  topLevelRequired: string[];
  recordTypeIds: string[];
  documentTypeIds: string[];
} {
  const required = (schema.required as string[]) ?? [];
  const documentTypeProp = schema.properties as { documentTypeId?: { enum?: string[] } };
  return {
    topLevelRequired: required,
    recordTypeIds: [],
    documentTypeIds: (documentTypeProp?.documentTypeId?.enum ?? []).filter(
      (id) => id !== PACK_DRIVEN_CLASSIFICATION_UNKNOWN && id !== PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
    ),
  };
}
