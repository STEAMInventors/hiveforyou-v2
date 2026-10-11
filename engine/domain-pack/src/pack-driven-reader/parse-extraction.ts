import type { SelectedRecordDefinition } from "./types.js";

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
  errors: string[];
  recordInstances: ParsedRecordInstance[];
};

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

export function parseAndValidatePackDrivenExtraction(input: {
  raw: unknown;
  expectedSourceDocumentId: string;
  selectedRecords: SelectedRecordDefinition[];
}): ParsePackDrivenExtractionResult {
  const errors: string[] = [];
  const recordInstances: ParsedRecordInstance[] = [];

  if (!input.raw || typeof input.raw !== "object") {
    return { ok: false, errors: ["extraction root must be object"], recordInstances: [] };
  }
  const root = input.raw as Record<string, unknown>;
  if (root.sourceDocumentId !== input.expectedSourceDocumentId) {
    errors.push("sourceDocumentId mismatch");
  }

  const instances = root.recordInstances;
  if (!Array.isArray(instances)) {
    return { ok: false, errors: ["recordInstances must be array"], recordInstances: [] };
  }

  const allowedRecordIds = new Set(input.selectedRecords.map((r) => r.recordTypeId));

  for (const [ri, inst] of instances.entries()) {
    if (!inst || typeof inst !== "object") {
      errors.push(`recordInstances[${ri}] must be object`);
      continue;
    }
    const row = inst as Record<string, unknown>;
    const recordTypeId = row.recordTypeId;
    const instanceIndex = row.instanceIndex;
    if (typeof recordTypeId !== "string" || !allowedRecordIds.has(recordTypeId)) {
      errors.push(`recordInstances[${ri}].recordTypeId invalid`);
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
      const def = fieldDef(input.selectedRecords, recordTypeId, fieldId);
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
      if (evidence && evidence.sourceDocumentId !== input.expectedSourceDocumentId) {
        errors.push(`recordInstances[${ri}].fields[${fi}]: evidence sourceDocumentId must match document`);
      }
      if (evidence && provenance === "quoted" && typeof f.value === "string") {
        if (!evidence.quote.includes(String(f.value))) {
          errors.push(
            `recordInstances[${ri}].fields[${fi}]: quoted value must appear in evidence.quote`,
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

    recordInstances.push({
      recordTypeId,
      instanceIndex,
      recordEvidence: recordEvidence ?? undefined,
      fields: parsedFields,
    });
  }

  return { ok: errors.length === 0, errors, recordInstances };
}
