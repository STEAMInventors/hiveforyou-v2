import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
} from "./constants.js";
import type { ProposalDomainPack, SelectedRecordDefinition } from "./types.js";
import { selectRecordDefinitions } from "./select-checklist.js";

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

function buildFieldCatalog(selectedRecords: SelectedRecordDefinition[]): unknown[] {
  return selectedRecords.map((record) => ({
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
  const allRecordIds = packRecordTypeIds(input.pack);
  const selectedRecords = selectRecordDefinitions(input.pack, allRecordIds);

  const recordInstanceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["recordTypeId", "instanceIndex", "fields"],
    properties: {
      recordTypeId: { type: "string", enum: allRecordIds },
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
      recordInstances: { type: "array", items: recordInstanceSchema },
    },
    definitions: {
      evidence: EVIDENCE_SCHEMA,
      fieldExtraction: FIELD_EXTRACTION_SCHEMA,
      recordInstance: recordInstanceSchema,
      documentTypeCatalog: input.pack.documentTypes.map((dt) => ({
        documentTypeId: dt.id,
        label: dt.label ?? null,
        checklist: dt.checklist,
        checklistPolicy: dt.checklistPolicy ?? null,
      })),
      fieldCatalog: buildFieldCatalog(selectedRecords),
    },
  };
}

function packRecordTypeIds(pack: ProposalDomainPack): string[] {
  return pack.recordTypes.map((r) => r.id);
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
  const defs = schema.definitions as {
    fieldCatalog?: Array<{ recordTypeId: string }>;
    documentTypeCatalog?: Array<{ documentTypeId: string }>;
  };
  const documentTypeProp = schema.properties as { documentTypeId?: { enum?: string[] } };
  return {
    topLevelRequired: required,
    recordTypeIds: (defs?.fieldCatalog ?? []).map((r) => r.recordTypeId),
    documentTypeIds: (documentTypeProp?.documentTypeId?.enum ?? []).filter(
      (id) => id !== PACK_DRIVEN_CLASSIFICATION_UNKNOWN && id !== PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
    ),
  };
}
