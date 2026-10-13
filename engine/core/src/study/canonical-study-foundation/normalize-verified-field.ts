import {
  applyFieldSynonymNormalization,
  parseFieldSynonyms,
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

function applyVocabularySynonyms(pack: ProposalDomainPack, text: string): string {
  const entries = parseFieldSynonyms(pack.vocabulary?.fieldSynonyms);
  return applyFieldSynonymNormalization(normalizeAttributeRaw(text), entries);
}

function applyConstructNormalize(
  pack: ProposalDomainPack,
  recordTypeId: string,
  text: string,
): string {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  let normalized = text;
  for (const constructId of record?.usesConstructs ?? []) {
    const construct = pack.constructs?.[constructId];
    for (const step of construct?.normalize ?? []) {
      if (step === "lowercase") {
        normalized = normalized.toLowerCase();
      } else if (step === "trim_punctuation") {
        normalized = normalized.replace(/[^\w\s/-]+/g, " ").replace(/\s+/g, " ").trim();
      } else if (step === "vocabulary_synonyms") {
        normalized = applyVocabularySynonyms(pack, normalized);
      }
    }
  }
  return normalized;
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
    case "code": {
      const code =
        typeof displayValue === "string" ? displayValue.trim().toLowerCase() : displayValue;
      return {
        valueKind,
        displayValue,
        normalizedValue: code,
      };
    }
    case "text": {
      const raw = typeof displayValue === "string" ? displayValue : String(displayValue ?? "");
      const normalized = applyConstructNormalize(input.pack, input.field.recordTypeId, raw);
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
