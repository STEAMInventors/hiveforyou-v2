import {
  PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS,
  PACK_DRIVEN_CLASSIFICATION_UNKNOWN,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION,
  PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY,
} from "./constants.js";
import type {
  ChecklistCoverageDisposition,
  ChecklistCoverageItem,
  ProposalDomainPack,
  ProposalRecordField,
  SelectedRecordDefinition,
} from "./types.js";
import { resolveDocumentTypeSpec, selectRecordDefinitions } from "./select-checklist.js";

export type PackDrivenEvidence = {
  sourceDocumentId: string;
  page: number;
  quote: string;
};

export type ParsedFieldExtraction = {
  fieldId: string;
  provenance: string;
  valueKind: string;
  value: unknown;
  modality: string;
  missingState: string | null;
  evidence: PackDrivenEvidence | null;
};

export type ParsedRecordInstance = {
  recordTypeId: string;
  instanceIndex: number;
  recordEvidence?: PackDrivenEvidence;
  fields: ParsedFieldExtraction[];
};

export type ParsePackDrivenExtractionResult = {
  ok: boolean;
  needsReview: boolean;
  documentTypeId: string | null;
  documentTypeResolved: "classified" | "generic_fallback" | "explicit_unclassified" | "unknown" | "ambiguous" | null;
  extractionSchemaVersion: string | null;
  errors: string[];
  checklistCoverage: ChecklistCoverageItem[];
  recordInstances: ParsedRecordInstance[];
};

const CHECKLIST_DISPOSITIONS = new Set<ChecklistCoverageDisposition>([
  "extracted",
  "not_found",
  "not_applicable",
  "unresolved",
]);

function usesLegacyChecklistInstanceCoverage(raw: Record<string, unknown>): boolean {
  const version = raw.schemaVersion;
  if (version === PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY) {
    return true;
  }
  if (version === PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION) {
    return false;
  }
  return raw.checklistCoverage === undefined;
}

const ALLOWED_MISSING = new Set([
  "field_present_but_empty",
  "not_found_in_supplied_documents",
  "not_applicable",
  "unresolved",
]);

function fieldDef(
  selected: SelectedRecordDefinition[],
  recordTypeId: string,
  fieldId: string,
): SelectedRecordDefinition["fields"][0] | undefined {
  const record = selected.find((r) => r.recordTypeId === recordTypeId);
  return record?.fields.find((f) => f.id === fieldId);
}

function parseEvidence(raw: unknown, errors: string[], where: string): PackDrivenEvidence | null {
  if (raw == null) return null;
  if (typeof raw !== "object") {
    errors.push(`${where}: evidence must be object`);
    return null;
  }
  const e = raw as Record<string, unknown>;
  const sourceDocumentId = e.sourceDocumentId;
  const page = e.page;
  const quote = e.quote;
  if (typeof sourceDocumentId !== "string" || !sourceDocumentId.trim()) {
    errors.push(`${where}: evidence.sourceDocumentId required`);
    return null;
  }
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
    errors.push(`${where}: evidence.page must be positive integer`);
    return null;
  }
  if (typeof quote !== "string" || !quote.trim()) {
    errors.push(`${where}: evidence.quote required`);
    return null;
  }
  return { sourceDocumentId, page, quote: quote.trim() };
}

function resolveSelectedRecordsForModelType(input: {
  pack: ProposalDomainPack;
  documentTypeId: string;
}): { selectedRecords: SelectedRecordDefinition[]; typeSpec: ReturnType<typeof resolveDocumentTypeSpec> } {
  const typeSpec = resolveDocumentTypeSpec({
    pack: input.pack,
    documentTypeId: input.documentTypeId,
    allowGenericUnclassifiedFallback: false,
  });
  const selectedRecords = selectRecordDefinitions(input.pack, typeSpec.checklistRecordTypeIds);
  return { selectedRecords, typeSpec };
}

function validateRecordInstances(input: {
  instances: unknown;
  expectedSourceDocumentId: string;
  selectedRecords: SelectedRecordDefinition[];
  errors: string[];
}): ParsedRecordInstance[] {
  const recordInstances: ParsedRecordInstance[] = [];
  const { instances, expectedSourceDocumentId, selectedRecords, errors } = input;

  if (!Array.isArray(instances)) {
    errors.push("recordInstances must be array");
    return recordInstances;
  }

  const allowedRecordIds = new Set(selectedRecords.map((r) => r.recordTypeId));

  for (const [ri, inst] of instances.entries()) {
    if (!inst || typeof inst !== "object") {
      errors.push(`recordInstances[${ri}] must be object`);
      continue;
    }
    const row = inst as Record<string, unknown>;
    const recordTypeId = row.recordTypeId;
    const instanceIndex = row.instanceIndex;
    if (typeof recordTypeId !== "string" || !allowedRecordIds.has(recordTypeId)) {
      errors.push(`recordInstances[${ri}].recordTypeId invalid for classified document type`);
      continue;
    }
    if (typeof instanceIndex !== "number" || !Number.isInteger(instanceIndex) || instanceIndex < 0) {
      errors.push(`recordInstances[${ri}].instanceIndex invalid`);
      continue;
    }

    const recordEvidence = parseEvidence(
      row.recordEvidence,
      errors,
      `recordInstances[${ri}].recordEvidence`,
    );

    const fieldsRaw = row.fields;
    if (!Array.isArray(fieldsRaw)) {
      errors.push(`recordInstances[${ri}].fields must be array`);
      continue;
    }

    const parsedFields: ParsedFieldExtraction[] = [];
    for (const [fi, fieldRow] of fieldsRaw.entries()) {
      if (!fieldRow || typeof fieldRow !== "object") {
        errors.push(`recordInstances[${ri}].fields[${fi}] must be object`);
        continue;
      }
      const f = fieldRow as Record<string, unknown>;
      const fieldId = f.fieldId;
      if (typeof fieldId !== "string") {
        errors.push(`recordInstances[${ri}].fields[${fi}].fieldId required`);
        continue;
      }
      const def = fieldDef(selectedRecords, recordTypeId, fieldId);
      if (!def) {
        errors.push(`recordInstances[${ri}].fields[${fi}] unknown field ${fieldId}`);
        continue;
      }

      const provenance = f.provenance;
      if (typeof provenance !== "string") {
        errors.push(`recordInstances[${ri}].fields[${fi}].provenance required`);
        continue;
      }
      if (provenance === "derived" || def.source.includes("derived")) {
        errors.push(`recordInstances[${ri}].fields[${fi}]: derived fields must not be emitted by model`);
        continue;
      }
      if (!def.source.includes(provenance)) {
        errors.push(
          `recordInstances[${ri}].fields[${fi}]: provenance ${provenance} not allowed for field`,
        );
        continue;
      }

      const missingState = f.missingState;
      if (missingState !== null && typeof missingState === "string" && !ALLOWED_MISSING.has(missingState)) {
        errors.push(`recordInstances[${ri}].fields[${fi}].missingState invalid`);
      }

      const evidence = parseEvidence(
        f.evidence,
        errors,
        `recordInstances[${ri}].fields[${fi}].evidence`,
      );

      if ((provenance === "quoted" || provenance === "classified") && !evidence) {
        errors.push(`recordInstances[${ri}].fields[${fi}]: evidence required for ${provenance}`);
      }
      if (evidence && evidence.sourceDocumentId !== expectedSourceDocumentId) {
        errors.push(`recordInstances[${ri}].fields[${fi}]: evidence sourceDocumentId must match document`);
      }
      if (evidence && provenance === "quoted" && typeof f.value === "string") {
        if (!evidence.quote.includes(String(f.value))) {
          errors.push(
            `recordInstances[${ri}].fields[${fi}]: quoted value must appear in evidence.quote`,
          );
        }
      }
      if (provenance === "classified" && def.enum?.length) {
        const valueText = f.value == null ? "" : String(f.value);
        if (valueText && !def.enum.includes(valueText)) {
          errors.push(
            `recordInstances[${ri}].fields[${fi}]: classified value must be one of allowed enum values`,
          );
        }
      }

      parsedFields.push({
        fieldId,
        provenance,
        valueKind: String(f.valueKind ?? def.valueKind),
        value: f.value ?? null,
        modality: String(f.modality ?? def.modality?.[0] ?? "observed"),
        missingState: missingState === null ? null : String(missingState),
        evidence,
      });
    }

    const recordDef = selectedRecords.find((record) => record.recordTypeId === recordTypeId);
    const identityKeyFields = recordDef?.identity?.keyFields ?? [];
    if (identityKeyFields.length > 0 && parsedFields.length > 0) {
      for (const keyField of identityKeyFields) {
        const fieldRow = parsedFields.find((field) => field.fieldId === keyField);
        if (!fieldRow) {
          errors.push(
            `recordInstances[${ri}]: identity key field ${keyField} must be emitted with a value or missingState`,
          );
          continue;
        }
        if (
          fieldRow.missingState === null &&
          (fieldRow.value == null || fieldRow.value === "")
        ) {
          errors.push(
            `recordInstances[${ri}].fields: identity key ${keyField} requires value or missingState`,
          );
        }
      }
    }

    recordInstances.push({
      recordTypeId,
      instanceIndex,
      recordEvidence: recordEvidence ?? undefined,
      fields: parsedFields,
    });
  }

  return recordInstances;
}

function fieldIsModelEmittable(def: ProposalRecordField): boolean {
  return !def.source.includes("derived");
}

function validateInstanceFieldCoverage(input: {
  recordDef: SelectedRecordDefinition;
  instance: ParsedRecordInstance;
  instanceLabel: string;
  errors: string[];
}): void {
  const { recordDef, instance, instanceLabel, errors } = input;
  const fieldById = new Map(instance.fields.map((field) => [field.fieldId, field]));
  for (const def of recordDef.fields) {
    if (!fieldIsModelEmittable(def)) {
      continue;
    }
    const row = fieldById.get(def.id);
    if (!row) {
      errors.push(
        `${instanceLabel}: checklist field ${recordDef.recordTypeId}.${def.id} not emitted (silent omission)`,
      );
      continue;
    }
    if (
      row.missingState === null &&
      (row.value === null || row.value === undefined || row.value === "")
    ) {
      errors.push(
        `${instanceLabel}: field ${def.id} requires extracted value or explicit missingState`,
      );
    }
  }
}

function parseChecklistCoverageItems(
  raw: unknown,
  errors: string[],
): ChecklistCoverageItem[] {
  if (!Array.isArray(raw)) {
    errors.push("checklistCoverage must be array");
    return [];
  }
  const items: ChecklistCoverageItem[] = [];
  for (const [index, row] of raw.entries()) {
    if (!row || typeof row !== "object") {
      errors.push(`checklistCoverage[${index}] must be object`);
      continue;
    }
    const record = row as Record<string, unknown>;
    const recordTypeId = record.recordTypeId;
    const disposition = record.disposition;
    if (typeof recordTypeId !== "string" || !recordTypeId.trim()) {
      errors.push(`checklistCoverage[${index}].recordTypeId required`);
      continue;
    }
    if (typeof disposition !== "string" || !CHECKLIST_DISPOSITIONS.has(disposition as ChecklistCoverageDisposition)) {
      errors.push(`checklistCoverage[${index}].disposition invalid`);
      continue;
    }
    const instanceIndexesRaw = record.instanceIndexes;
    let instanceIndexes: number[] | undefined;
    if (instanceIndexesRaw !== undefined) {
      if (!Array.isArray(instanceIndexesRaw)) {
        errors.push(`checklistCoverage[${index}].instanceIndexes must be array`);
      } else {
        instanceIndexes = [];
        for (const value of instanceIndexesRaw) {
          if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
            errors.push(`checklistCoverage[${index}].instanceIndexes invalid`);
            instanceIndexes = undefined;
            break;
          }
          instanceIndexes.push(value);
        }
      }
    }
    const note = record.note;
    items.push({
      recordTypeId: recordTypeId.trim(),
      disposition: disposition as ChecklistCoverageDisposition,
      ...(instanceIndexes ? { instanceIndexes } : {}),
      ...(note === null || typeof note === "string" ? { note: note as string | null } : {}),
    });
  }
  return items;
}

function validateChecklistCoverageDeclarations(input: {
  selectedRecords: SelectedRecordDefinition[];
  checklistCoverage: ChecklistCoverageItem[];
  recordInstances: ParsedRecordInstance[];
  errors: string[];
}): boolean {
  let needsReview = false;
  const expectedIds = input.selectedRecords.map((record) => record.recordTypeId);
  const expectedSet = new Set(expectedIds);
  const seen = new Set<string>();

  for (const item of input.checklistCoverage) {
    if (!expectedSet.has(item.recordTypeId)) {
      input.errors.push(`checklistCoverage: unknown recordTypeId ${item.recordTypeId}`);
      continue;
    }
    if (seen.has(item.recordTypeId)) {
      input.errors.push(`checklistCoverage: duplicate recordTypeId ${item.recordTypeId}`);
      continue;
    }
    seen.add(item.recordTypeId);

    const instancesForType = input.recordInstances.filter(
      (instance) => instance.recordTypeId === item.recordTypeId,
    );
    const indexesForType = new Set(instancesForType.map((instance) => instance.instanceIndex));

    if (item.disposition === "unresolved") {
      needsReview = true;
      input.errors.push(`checklistCoverage ${item.recordTypeId}: unresolved requires review`);
    }

    if (item.disposition === "extracted") {
      if (!item.instanceIndexes?.length) {
        input.errors.push(`checklistCoverage ${item.recordTypeId}: extracted requires instanceIndexes`);
      } else {
        for (const idx of item.instanceIndexes) {
          if (!indexesForType.has(idx)) {
            input.errors.push(
              `checklistCoverage ${item.recordTypeId}: instanceIndex ${idx} not present in recordInstances`,
            );
          }
        }
      }
      if (instancesForType.length === 0) {
        input.errors.push(
          `checklistCoverage ${item.recordTypeId}: extracted contradicts empty recordInstances`,
        );
      }
    }

    if (item.disposition === "not_found" || item.disposition === "not_applicable") {
      if (instancesForType.length > 0) {
        input.errors.push(
          `checklistCoverage ${item.recordTypeId}: ${item.disposition} cannot coexist with recordInstances`,
        );
      }
    }
  }

  for (const recordTypeId of expectedIds) {
    if (!seen.has(recordTypeId)) {
      input.errors.push(`checklistCoverage: missing declaration for ${recordTypeId}`);
    }
  }

  const instancesByRecord = new Map<string, ParsedRecordInstance[]>();
  for (const instance of input.recordInstances) {
    const bucket = instancesByRecord.get(instance.recordTypeId) ?? [];
    bucket.push(instance);
    instancesByRecord.set(instance.recordTypeId, bucket);
  }

  for (const recordDef of input.selectedRecords) {
    const instances = instancesByRecord.get(recordDef.recordTypeId) ?? [];
    const coverage = input.checklistCoverage.find((item) => item.recordTypeId === recordDef.recordTypeId);
    if (coverage?.disposition === "extracted") {
      if (!recordDef.repeatable && instances.length > 1) {
        input.errors.push(
          `checklist recordTypeId ${recordDef.recordTypeId}: non-repeatable record emitted ${instances.length} instances`,
        );
      }
      for (const [index, instance] of instances.entries()) {
        validateInstanceFieldCoverage({
          recordDef,
          instance,
          instanceLabel: `recordInstances[${recordDef.recordTypeId}#${index}]`,
          errors: input.errors,
        });
      }
    }
  }

  return needsReview;
}

/** Legacy schema: infer checklist completeness from recordInstances only. */
function validateLegacyChecklistCoverage(input: {
  selectedRecords: SelectedRecordDefinition[];
  recordInstances: ParsedRecordInstance[];
  errors: string[];
}): void {
  const instancesByRecord = new Map<string, ParsedRecordInstance[]>();
  for (const instance of input.recordInstances) {
    const bucket = instancesByRecord.get(instance.recordTypeId) ?? [];
    bucket.push(instance);
    instancesByRecord.set(instance.recordTypeId, bucket);
  }

  for (const recordDef of input.selectedRecords) {
    const instances = instancesByRecord.get(recordDef.recordTypeId) ?? [];
    if (instances.length === 0) {
      input.errors.push(
        `checklist recordTypeId ${recordDef.recordTypeId}: no instance emitted (silent omission)`,
      );
      continue;
    }
    if (!recordDef.repeatable && instances.length > 1) {
      input.errors.push(
        `checklist recordTypeId ${recordDef.recordTypeId}: non-repeatable record emitted ${instances.length} instances`,
      );
    }
    for (const [index, instance] of instances.entries()) {
      validateInstanceFieldCoverage({
        recordDef,
        instance,
        instanceLabel: `recordInstances[${recordDef.recordTypeId}#${index}]`,
        errors: input.errors,
      });
    }
  }
}

/** @deprecated Prefer parseAndValidatePackDrivenExtraction with full pack (model-selected type). */
export function parseAndValidatePackDrivenExtractionLegacy(input: {
  raw: unknown;
  expectedSourceDocumentId: string;
  selectedRecords: SelectedRecordDefinition[];
}): ParsePackDrivenExtractionResult {
  const errors: string[] = [];
  if (!input.raw || typeof input.raw !== "object") {
    return {
      ok: false,
      needsReview: false,
      documentTypeId: null,
      documentTypeResolved: null,
      extractionSchemaVersion: null,
      errors: ["extraction root must be object"],
      checklistCoverage: [],
      recordInstances: [],
    };
  }
  const root = input.raw as Record<string, unknown>;
  if (root.sourceDocumentId !== input.expectedSourceDocumentId) {
    errors.push("sourceDocumentId mismatch");
  }
  const recordInstances = validateRecordInstances({
    instances: root.recordInstances,
    expectedSourceDocumentId: input.expectedSourceDocumentId,
    selectedRecords: input.selectedRecords,
    errors,
  });
  return {
    ok: errors.length === 0,
    needsReview: false,
    documentTypeId: typeof root.documentTypeId === "string" ? root.documentTypeId : null,
    documentTypeResolved: "classified",
    extractionSchemaVersion:
      typeof root.schemaVersion === "string" ? root.schemaVersion : PACK_DRIVEN_READER_EXTRACTION_SCHEMA_VERSION_LEGACY,
    errors,
    checklistCoverage: [],
    recordInstances,
  };
}

function extractionSchemaVersionOf(root: Record<string, unknown>): string | null {
  return typeof root.schemaVersion === "string" ? root.schemaVersion : null;
}

export function parseAndValidatePackDrivenExtraction(input: {
  pack: ProposalDomainPack;
  raw: unknown;
  expectedSourceDocumentId: string;
}): ParsePackDrivenExtractionResult {
  const errors: string[] = [];

  if (!input.raw || typeof input.raw !== "object") {
    return {
      ok: false,
      needsReview: false,
      documentTypeId: null,
      documentTypeResolved: null,
      extractionSchemaVersion: null,
      errors: ["extraction root must be object"],
      checklistCoverage: [],
      recordInstances: [],
    };
  }
  const root = input.raw as Record<string, unknown>;
  const extractionSchemaVersion = extractionSchemaVersionOf(root);
  if (root.sourceDocumentId !== input.expectedSourceDocumentId) {
    errors.push("sourceDocumentId mismatch");
  }

  const documentTypeRaw = root.documentTypeId;
  if (typeof documentTypeRaw !== "string" || !documentTypeRaw.trim()) {
    errors.push("documentTypeId required");
    return {
      ok: false,
      needsReview: true,
      documentTypeId: null,
      documentTypeResolved: null,
      extractionSchemaVersion,
      errors,
      checklistCoverage: [],
      recordInstances: [],
    };
  }
  const documentTypeId = documentTypeRaw.trim();
  const legacyChecklist = usesLegacyChecklistInstanceCoverage(root);

  if (documentTypeId === PACK_DRIVEN_CLASSIFICATION_UNKNOWN) {
    errors.push("classification disposition UNKNOWN — NEEDS_REVIEW");
    if (Array.isArray(root.recordInstances) && root.recordInstances.length > 0) {
      errors.push("recordInstances must be empty for UNKNOWN");
    }
    if (!legacyChecklist && Array.isArray(root.checklistCoverage) && root.checklistCoverage.length > 0) {
      errors.push("checklistCoverage must be empty for UNKNOWN");
    }
    return {
      ok: false,
      needsReview: true,
      documentTypeId,
      documentTypeResolved: "unknown",
      extractionSchemaVersion,
      errors,
      checklistCoverage: [],
      recordInstances: [],
    };
  }

  if (documentTypeId === PACK_DRIVEN_CLASSIFICATION_AMBIGUOUS) {
    errors.push("classification disposition AMBIGUOUS — NEEDS_REVIEW");
    if (Array.isArray(root.recordInstances) && root.recordInstances.length > 0) {
      errors.push("recordInstances must be empty for AMBIGUOUS");
    }
    if (!legacyChecklist && Array.isArray(root.checklistCoverage) && root.checklistCoverage.length > 0) {
      errors.push("checklistCoverage must be empty for AMBIGUOUS");
    }
    return {
      ok: false,
      needsReview: true,
      documentTypeId,
      documentTypeResolved: "ambiguous",
      extractionSchemaVersion,
      errors,
      checklistCoverage: [],
      recordInstances: [],
    };
  }

  const packType = input.pack.documentTypes.find((d) => d.id === documentTypeId);
  if (!packType) {
    errors.push(`documentTypeId ${documentTypeId} is not in pack documentTypes`);
    return {
      ok: false,
      needsReview: true,
      documentTypeId,
      documentTypeResolved: null,
      extractionSchemaVersion,
      errors,
      checklistCoverage: [],
      recordInstances: [],
    };
  }

  let selectedRecords: SelectedRecordDefinition[];
  let typeSpec: ReturnType<typeof resolveDocumentTypeSpec>;
  try {
    ({ selectedRecords, typeSpec } = resolveSelectedRecordsForModelType({
      pack: input.pack,
      documentTypeId,
    }));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "document type resolution failed");
    return {
      ok: false,
      needsReview: true,
      documentTypeId,
      documentTypeResolved: null,
      extractionSchemaVersion,
      errors,
      checklistCoverage: [],
      recordInstances: [],
    };
  }

  const recordInstances = validateRecordInstances({
    instances: root.recordInstances,
    expectedSourceDocumentId: input.expectedSourceDocumentId,
    selectedRecords,
    errors,
  });

  let checklistCoverage: ChecklistCoverageItem[] = [];
  let coverageNeedsReview = false;
  if (legacyChecklist) {
    validateLegacyChecklistCoverage({
      selectedRecords,
      recordInstances,
      errors,
    });
  } else {
    checklistCoverage = parseChecklistCoverageItems(root.checklistCoverage, errors);
    coverageNeedsReview = validateChecklistCoverageDeclarations({
      selectedRecords,
      checklistCoverage,
      recordInstances,
      errors,
    });
  }

  return {
    ok: errors.length === 0,
    needsReview: coverageNeedsReview,
    documentTypeId,
    documentTypeResolved: typeSpec.resolution,
    extractionSchemaVersion,
    errors,
    checklistCoverage,
    recordInstances,
  };
}
