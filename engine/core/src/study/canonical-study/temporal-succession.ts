import type { IndexedFoundation, IndexedRecordVersion } from "./indexed-foundation.js";
import { resolveRelationshipRules } from "./indexed-foundation.js";

export function temporalDateForRecord(
  record: IndexedRecordVersion,
  indexed: IndexedFoundation,
): string | null {
  const rules = resolveRelationshipRules(indexed.pack);
  for (const fieldId of rules.temporalSuccessionFieldIds) {
    const chip = record.provenanceByFieldKey[fieldId];
    const value = chip?.normalized.normalizedValue;
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

/** Verified temporal succession — document ordering date alone is insufficient when configured. */
export function hasVerifiedTemporalSuccession(
  earlier: IndexedRecordVersion,
  later: IndexedRecordVersion,
  indexed: IndexedFoundation,
): { ok: boolean; basis: string | null } {
  return hasVerifiedLogicalSuccession(earlier, later, indexed);
}

/** Logical plan/version succession from verified event dates — never from sort rank alone. */
export function hasVerifiedLogicalSuccession(
  earlier: IndexedRecordVersion,
  later: IndexedRecordVersion,
  indexed: IndexedFoundation,
): { ok: boolean; basis: string | null } {
  const rules = resolveRelationshipRules(indexed.pack);
  const earlierEvent = temporalDateForRecord(earlier, indexed);
  const laterEvent = temporalDateForRecord(later, indexed);

  if (earlierEvent && laterEvent && earlierEvent < laterEvent) {
    return { ok: true, basis: `event_dates:${earlierEvent}->${laterEvent}` };
  }

  if (!rules.changeRequiresTemporalSuccession) {
    if (
      earlier.orderingDate &&
      later.orderingDate &&
      earlier.orderingDate < later.orderingDate
    ) {
      return { ok: true, basis: `ordering_dates:${earlier.orderingDate}->${later.orderingDate}` };
    }
  }

  return { ok: false, basis: null };
}
