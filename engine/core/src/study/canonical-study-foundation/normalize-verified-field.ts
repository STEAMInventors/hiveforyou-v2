import {
  applyComparableNormalizeSteps,
  DEFAULT_COMPARABLE_NORMALIZE_STEPS,
  type ProposalDomainPack,
  type ProposalRecordField,
} from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyFoundationNormalizedValue,
  CanonicalStudyFoundationProposedField,
} from "@hiveforyou/shared/canonical-study-foundation";

import {
  normalizeAttributeRaw,
  normalizeMoney,
  normalizePartialDate,
} from "../../atoms/normalize.js";

function resolveFieldDef(
  pack: ProposalDomainPack,
  recordTypeId: string,
  fieldId: string,
): ProposalRecordField | null {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  return record?.fields.find((f) => f.id === fieldId) ?? null;
}

function resolveUnitAlias(pack: ProposalDomainPack, unit: string | null | undefined): string | null {
  if (!unit) {
    return null;
  }
  const vocabulary = pack.vocabulary?.unitAliases;
  if (!vocabulary) {
    return unit;
  }
  const lower = unit.trim().toLowerCase();
  if (Array.isArray(vocabulary)) {
    for (const entry of vocabulary) {
      if (entry.canonical.toLowerCase() === lower) {
        return entry.canonical;
      }
      if (entry.aliases.some((alias) => alias.toLowerCase() === lower)) {
        return entry.canonical;
      }
    }
    return unit;
  }
  for (const [canonical, aliases] of Object.entries(vocabulary)) {
    if (canonical.toLowerCase() === lower) {
      return canonical;
    }
    if (aliases.some((alias) => alias.toLowerCase() === lower)) {
      return canonical;
    }
  }
  return unit;
}

function applyLegacyCodeValue(input: {
  pack: ProposalDomainPack;
  recordTypeId: string;
  fieldId: string;
  code: string;
}): string {
  const legacyMap = input.pack.vocabulary?.readerLegacyContextMap;
  if (!legacyMap) {
    return input.code;
  }
  const fieldPath = `${input.recordTypeId}.${input.fieldId}`;
  const scoped = legacyMap[fieldPath] as Record<string, string> | undefined;
  const global = legacyMap[input.fieldId] as Record<string, string> | undefined;
  return scoped?.[input.code] ?? global?.[input.code] ?? input.code;
}

function comparableStepsForRecord(
  pack: ProposalDomainPack,
  recordTypeId: string,
): readonly ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[] {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  const merged = new Set<string>();
  for (const constructId of record?.usesConstructs ?? []) {
    for (const step of pack.constructs?.[constructId]?.normalize ?? []) {
      merged.add(step);
    }
  }
  if (merged.size === 0) {
    return DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  return [...merged] as ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[];
}

function applyComparableNormalizeForField(input: {
  pack: ProposalDomainPack;
  recordTypeId: string;
  fieldId: string;
  text: string;
}): string {
  const fieldPath = `${input.recordTypeId}.${input.fieldId}`;
  const raw = normalizeAttributeRaw(input.text);
  return applyComparableNormalizeSteps(
    raw,
    comparableStepsForRecord(input.pack, input.recordTypeId),
    input.pack,
    fieldPath,
  );
}

export function normalizeVerifiedField(input: {
  field: CanonicalStudyFoundationProposedField;
  pack: ProposalDomainPack;
  documentYearHint?: number | null;
  documentMonthHint?: number | null;
}): CanonicalStudyFoundationNormalizedValue {
  const def = resolveFieldDef(input.pack, input.field.recordTypeId, input.field.fieldId);
  const displayValue = input.field.displayValue;
  const valueKind = input.field.valueKind;

  switch (valueKind) {
    case "date": {
      const raw = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
      const iso =
        /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? raw
          : normalizePartialDate(raw, input.documentYearHint ?? null, input.documentMonthHint ?? null);
      return {
        valueKind,
        displayValue,
        normalizedValue: iso,
      };
    }
    case "quantity": {
      let amount: number | null = null;
      if (typeof displayValue === "number" && Number.isFinite(displayValue)) {
        amount = displayValue;
      } else if (typeof displayValue === "string") {
        amount = normalizeMoney(displayValue) ?? Number.parseFloat(displayValue);
      }
      const unit = resolveUnitAlias(input.pack, def?.unit ?? null);
      return {
        valueKind,
        displayValue,
        normalizedValue: amount,
        unit,
      };
    }
    case "code":
    case "classification": {
      const rawCode =
        typeof displayValue === "string" ? displayValue.trim().toLowerCase() : displayValue;
      const code =
        typeof rawCode === "string"
          ? applyLegacyCodeValue({
              pack: input.pack,
              recordTypeId: input.field.recordTypeId,
              fieldId: input.field.fieldId,
              code: rawCode,
            })
          : rawCode;
      return {
        valueKind,
        displayValue,
        normalizedValue: code,
      };
    }
    case "text": {
      const raw = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
      const normalized = applyComparableNormalizeForField({
        pack: input.pack,
        recordTypeId: input.field.recordTypeId,
        fieldId: input.field.fieldId,
        text: raw,
      });
      return {
        valueKind,
        displayValue,
        normalizedValue: normalized,
      };
    }
    case "boolean": {
      return {
        valueKind,
        displayValue,
        normalizedValue: displayValue,
      };
    }
    default:
      return {
        valueKind,
        displayValue,
        normalizedValue: displayValue,
        unit: def?.unit ?? null,
      };
  }
}
