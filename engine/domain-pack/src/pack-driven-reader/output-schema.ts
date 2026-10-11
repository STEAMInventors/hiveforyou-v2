import type { SelectedRecordDefinition } from "./types.js";

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
    fieldId: { type: "string" },
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

function buildSchemaEnvelope(input: {
  packId: string;
  packVersion: string;
  documentTypeId?: string;
  sourceDocumentId?: string;
  selectedRecords: SelectedRecordDefinition[];
  includeFieldCatalog: boolean;
}): Record<string, unknown> {
  const recordInstanceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["recordTypeId", "instanceIndex", "fields"],
    properties: {
      recordTypeId: { type: "string" },
      instanceIndex: { type: "integer", minimum: 0 },
      recordEvidence: EVIDENCE_SCHEMA,
      fields: { type: "array", items: FIELD_EXTRACTION_SCHEMA },
    },
  };

  const definitions: Record<string, unknown> = {
    evidence: EVIDENCE_SCHEMA,
    fieldExtraction: FIELD_EXTRACTION_SCHEMA,
    recordInstance: recordInstanceSchema,
  };

  if (input.includeFieldCatalog && input.selectedRecords.length > 0) {
    definitions.allowedRecordTypeIds = {
      type: "string",
      enum: input.selectedRecords.map((r) => r.recordTypeId),
    };
    definitions.fieldCatalog = input.selectedRecords.map((record) => ({
      recordTypeId: record.recordTypeId,
      repeatable: record.repeatable,
      fields: record.fields.map((f) => ({
        fieldId: f.id,
        valueKind: f.valueKind,
        source: f.source,
        modality: f.modality ?? [],
        enum: f.enum ?? null,
        unit: f.unit ?? null,
        description: f.description ?? null,
        modelMayEmit: !f.source.includes("derived"),
      })),
    }));
  }

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
      "recordInstances",
    ],
    properties: {
      schemaVersion: { type: "string", const: "hive.pack-driven-reader-extraction/0.1.0" },
      packId: { type: "string", const: input.packId },
      packVersion: { type: "string", const: input.packVersion },
      documentTypeId: input.documentTypeId
        ? { type: "string", const: input.documentTypeId }
        : { type: "string" },
      sourceDocumentId: input.sourceDocumentId
        ? { type: "string", const: input.sourceDocumentId }
        : { type: "string" },
      recordInstances: { type: "array", items: recordInstanceSchema },
    },
    definitions,
  };
}

/** Stable-prefix envelope (shape + evidence/field items; no document field catalog). */
export function buildStablePackDrivenReaderOutputJsonSchema(input: {
  packId: string;
  packVersion: string;
}): Record<string, unknown> {
  return buildSchemaEnvelope({
    packId: input.packId,
    packVersion: input.packVersion,
    selectedRecords: [],
    includeFieldCatalog: false,
  });
}

export function buildPackDrivenReaderOutputJsonSchema(input: {
  packId: string;
  packVersion: string;
  documentTypeId: string;
  sourceDocumentId: string;
  selectedRecords: SelectedRecordDefinition[];
}): Record<string, unknown> {
  return buildSchemaEnvelope({ ...input, includeFieldCatalog: true });
}

export function summarizeOutputSchemaStructure(schema: Record<string, unknown>): {
  topLevelRequired: string[];
  recordTypeIds: string[];
} {
  const required = (schema.required as string[]) ?? [];
  const defs = schema.definitions as { fieldCatalog?: Array<{ recordTypeId: string }> };
  return {
    topLevelRequired: required,
    recordTypeIds: (defs?.fieldCatalog ?? []).map((r) => r.recordTypeId),
  };
}
