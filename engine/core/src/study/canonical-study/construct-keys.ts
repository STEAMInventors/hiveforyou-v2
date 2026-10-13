import {
  applyComparableNormalizeSteps,
  DEFAULT_COMPARABLE_NORMALIZE_STEPS,
  parseFieldSynonyms,
  type ProposalConstruct,
  type ProposalDomainPack,
} from "@hiveforyou/domain-pack";

import type { IndexedRecordVersion } from "./indexed-foundation.js";

function normalizeStepsForField(
  pack: ProposalDomainPack,
  recordTypeId: string,
  constructId?: string,
): readonly ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[] {
  if (constructId) {
    return pack.constructs?.[constructId]?.normalize ?? DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  const merged = new Set<string>();
  for (const constructKey of record?.usesConstructs ?? []) {
    for (const step of pack.constructs?.[constructKey]?.normalize ?? []) {
      merged.add(step);
    }
  }
  if (merged.size === 0) {
    return DEFAULT_COMPARABLE_NORMALIZE_STEPS;
  }
  return [...merged] as ("lowercase" | "trim_punctuation" | "vocabulary_synonyms")[];
}

export function normalizedFieldValue(
  record: IndexedRecordVersion,
  fieldId: string,
  pack: ProposalDomainPack,
  constructId?: string,
): string | null {
  const chip = record.provenanceByFieldKey[fieldId];
  if (!chip) {
    return null;
  }
  const raw = chip.normalized.normalizedValue;
  if (raw == null || raw === "") {
    return null;
  }
  const fieldPath = `${record.recordTypeId}.${fieldId}`;
  const steps = normalizeStepsForField(pack, record.recordTypeId, constructId);
  return applyComparableNormalizeSteps(String(raw), steps, pack, fieldPath);
}

export type ContentKeyResult = {
  key: string | null;
  partial: boolean;
  parts: Record<string, string | null>;
  missingRequired: string[];
  conflictingOptional: string[];
};

export function buildContentKey(
  record: IndexedRecordVersion,
  pack: ProposalDomainPack,
): ContentKeyResult {
  const recordDef = pack.recordTypes.find((r) => r.id === record.recordTypeId);
  const identity = recordDef?.identity;
  const missingRequired: string[] = [];
  const conflictingOptional: string[] = [];
  const parts: Record<string, string | null> = {};

  if (!identity) {
    return { key: null, partial: true, parts, missingRequired: ["identity"], conflictingOptional };
  }

  for (const fieldId of identity.keyFields ?? []) {
    const value = normalizedFieldValue(record, fieldId, pack);
    parts[fieldId] = value;
    if (value == null) {
      missingRequired.push(fieldId);
    }
  }

  if (missingRequired.length > 0) {
    return { key: null, partial: true, parts, missingRequired, conflictingOptional };
  }

  const material = (identity.keyFields ?? [])
    .map((fieldId) => `${fieldId}=${parts[fieldId] ?? ""}`)
    .join("|");
  return { key: material, partial: false, parts, missingRequired, conflictingOptional };
}

export function buildConstructJoinKey(
  record: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): string | null {
  const construct = pack.constructs?.[constructId] as ProposalConstruct | undefined;
  if (!construct) {
    return null;
  }
  const parts: string[] = [];
  for (const fieldSuffix of construct.requiredFields ?? []) {
    const fieldId = `${constructId}.${fieldSuffix}`;
    const value = normalizedFieldValue(record, fieldId, pack, constructId);
    if (value == null) {
      return null;
    }
    parts.push(`${fieldId}=${value}`);
  }
  return parts.join("|");
}

export function valuesEquivalent(
  left: string | null,
  right: string | null,
  constructId: string | undefined,
  pack: ProposalDomainPack,
): "equal" | "different" | "possibly_same" {
  if (left == null || right == null) {
    return "different";
  }
  if (left === right) {
    return "equal";
  }
  const onPartial = constructId ? pack.constructs?.[constructId]?.onPartialMatch : undefined;
  if (onPartial === "possiblySame") {
    if (left.includes(right) || right.includes(left)) {
      return "possibly_same";
    }
  }
  return "different";
}

/** Required construct key plus contextual dimensions that are actually verified. */
export function buildSeriesDimensionKey(
  record: IndexedRecordVersion,
  constructId: string,
  pack: ProposalDomainPack,
): string | null {
  const base = buildConstructJoinKey(record, constructId, pack);
  if (!base) {
    return null;
  }
  const construct = pack.constructs?.[constructId] as ProposalConstruct | undefined;
  const context: string[] = [];
  for (const fieldSuffix of construct?.comparedIfBothPresent ?? []) {
    const fieldId = `${constructId}.${fieldSuffix}`;
    const value = normalizedFieldValue(record, fieldId, pack, constructId);
    if (value != null) {
      context.push(`${fieldId}=${value}`);
    }
  }
  return [base, ...context].join("|");
}
