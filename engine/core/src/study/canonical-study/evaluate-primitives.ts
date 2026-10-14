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
  scopeSourceDocumentIds?: Set<string>,
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
    const w = when as {
      birthDate?: string;
      onDate?: string;
      atLeast?: number;
      atLeastFromReference?: string;
      offsetYears?: number;
    };
    if (!w.birthDate || !w.onDate) {
      return { ok: false, reason: "ageOnDate_paths_missing" };
    }

    const birth = parsePackFieldPath(w.birthDate);
    const birthValues = new Set<string>();
    for (const record of indexed.records) {
      if (!birth || record.recordTypeId !== birth.recordTypeId) {
        continue;
      }
      const v = record.provenanceByFieldKey[birth.fieldId]?.normalized.normalizedValue;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        birthValues.add(v);
      }
    }
    if (birthValues.size !== 1) {
      return {
        ok: false,
        reason: birthValues.size === 0 ? "ageOnDate_birth_date_missing" : "ageOnDate_birth_date_conflict",
      };
    }
    const birthIso = [...birthValues][0]!;

    const scopeRecords = indexed.records.filter(
      (r) => !scopeSourceDocumentIds || scopeSourceDocumentIds.has(r.sourceDocumentId),
    );
    const onChip = resolvePackFieldValue(indexed, w.onDate, scopeRecords);
    const onIso = onChip?.normalized.normalizedValue;
    if (typeof onIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(onIso)) {
      return { ok: false, reason: "ageOnDate_on_date_missing" };
    }

    let threshold: number | null = typeof w.atLeast === "number" ? w.atLeast : null;
    if (threshold == null && w.atLeastFromReference) {
      const rows = lookupReferenceTable(indexed.pack, sourceContext, w.atLeastFromReference) as {
        state?: string;
        age_of_majority?: number;
      }[];
      const state =
        typeof sourceContext.jurisdiction === "object" && sourceContext.jurisdiction != null
          ? sourceContext.jurisdiction.state
          : undefined;
      const row = state ? rows.find((item) => item.state === state) : undefined;
      if (typeof row?.age_of_majority === "number") {
        threshold = row.age_of_majority + (w.offsetYears ?? 0);
      }
    }
    if (threshold == null) {
      return { ok: false, reason: "ageOnDate_reference_unavailable" };
    }

    const [by, bm, bd] = birthIso.split("-").map(Number) as [number, number, number];
    const [oy, om, od] = onIso.split("-").map(Number) as [number, number, number];
    const age = oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
    return age >= threshold ? { ok: true, value: { age } } : { ok: false, reason: "applicability_false" };
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
