import type { ProposalDomainPack, ProposalRequirementWhen } from "@hiveforyou/domain-pack";
import type { CanonicalStudyProvenanceChip } from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudySourceContext } from "@hiveforyou/shared/canonical-study-artifact";

import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { parsePackFieldPath } from "../canonical-study-foundation/field-key.js";

export type PrimitiveResult =
  | { ok: true; value?: unknown }
  | { ok: false; reason: string };

export function evaluateExists(
  indexed: IndexedFoundation,
  recordTypeId: string,
  fieldId: string,
  equals?: unknown,
): { found: boolean; chips: CanonicalStudyProvenanceChip[] } {
  const chips: CanonicalStudyProvenanceChip[] = [];
  for (const record of indexed.records) {
    if (record.recordTypeId !== recordTypeId) {
      continue;
    }
    const chip = record.provenanceByFieldKey[fieldId];
    if (!chip) {
      continue;
    }
    const value = chip.normalized.normalizedValue;
    if (equals !== undefined && value !== equals) {
      continue;
    }
    if (value == null || value === "") {
      continue;
    }
    chips.push(chip);
  }
  chips.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  return { found: chips.length > 0, chips };
}

export function evaluateWhenClause(
  when: ProposalRequirementWhen | undefined,
  indexed: IndexedFoundation,
  sourceContext: CanonicalStudySourceContext,
): PrimitiveResult {
  if (!when) {
    return { ok: true };
  }
  if (when.primitive === "exists") {
    if (!when.record || !when.field) {
      return { ok: false, reason: "exists_when_missing_record_or_field" };
    }
    const result = evaluateExists(indexed, when.record, when.field, when.equals);
    return result.found ? { ok: true } : { ok: false, reason: "applicability_false" };
  }
  if (when.primitive === "ageOnDate") {
    return { ok: false, reason: "ageOnDate_unresolved_reference_or_dates" };
  }
  return { ok: false, reason: `unsupported_when_primitive:${when.primitive}` };
}

export function resolvePackFieldValue(
  indexed: IndexedFoundation,
  path: string,
  scopeRecords: IndexedRecordVersion[],
): CanonicalStudyProvenanceChip | null {
  const parsed = parsePackFieldPath(path);
  if (!parsed) {
    return null;
  }
  for (const record of scopeRecords) {
    if (record.recordTypeId !== parsed.recordTypeId) {
      continue;
    }
    const chip = record.provenanceByFieldKey[parsed.fieldId];
    if (chip) {
      return chip;
    }
  }
  return null;
}

export function compareValuesPrimitive(
  left: CanonicalStudyProvenanceChip | null,
  right: CanonicalStudyProvenanceChip | null,
): PrimitiveResult {
  if (!left || !right) {
    return { ok: false, reason: "missing_operand" };
  }
  const leftVal = left.normalized.normalizedValue;
  const rightVal = right.normalized.normalizedValue;
  if (leftVal == null || rightVal == null) {
    return { ok: false, reason: "unverified_operand_value" };
  }
  const equal = JSON.stringify(leftVal) === JSON.stringify(rightVal);
  return { ok: true, value: { equal, left: leftVal, right: rightVal } };
}

export function elapsedSincePrimitive(
  left: CanonicalStudyProvenanceChip | null,
  right: CanonicalStudyProvenanceChip | null,
): PrimitiveResult {
  if (!left || !right) {
    return { ok: false, reason: "missing_operand" };
  }
  const start = left.normalized.normalizedValue;
  const end = right.normalized.normalizedValue;
  if (typeof start !== "string" || typeof end !== "string") {
    return { ok: false, reason: "operands_not_dates" };
  }
  if (start >= end) {
    return { ok: false, reason: "invalid_date_order" };
  }
  return { ok: true, value: { start, end } };
}

export function lookupReferenceTable(
  pack: ProposalDomainPack,
  sourceContext: CanonicalStudySourceContext,
  tableId: string,
): unknown[] {
  const override = sourceContext.referenceTables?.[tableId]?.rows;
  if (override) {
    return override;
  }
  const entry = pack.referenceTables?.entries?.find((item) => item.id === tableId);
  return entry?.rows ?? [];
}
