import type { ClaimValue } from "@hiveforyou/shared/case-intelligence/3";

import type { DisplayValue } from "./case-view";

function normText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normUnit(unit: string | null | undefined): string | null {
  const u = (unit ?? "").trim();
  return u.length ? u.toLowerCase() : null;
}

/** Compare validated claim values for change detection (kind, scalar, unit). */
export function claimValuesEqual(
  a: ClaimValue,
  aUnit: string | null | undefined,
  b: ClaimValue,
  bUnit: string | null | undefined,
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (normUnit(aUnit) !== normUnit(bUnit)) {
    return false;
  }
  switch (a.kind) {
    case "quantity":
      return b.kind === "quantity" && a.amount === b.amount;
    case "text":
      return b.kind === "text" && normText(a.text) === normText(b.text);
    case "code":
      return b.kind === "code" && normText(a.code) === normText(b.code);
    case "boolean":
      return b.kind === "boolean" && a.value === b.value;
    case "entity_ref":
      return b.kind === "entity_ref" && a.entityId === b.entityId;
    case "date":
      return b.kind === "date" && normText(a.value) === normText(b.value);
    case "period":
      return (
        b.kind === "period" &&
        normText(a.start) === normText(b.start) &&
        normText(a.end) === normText(b.end)
      );
    default:
      return false;
  }
}

/** Compare presentation DisplayValue rows (after code formatting). */
export function displayValuesEqual(a: DisplayValue, b: DisplayValue): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (normUnit(a.unit) !== normUnit(b.unit)) {
    return false;
  }
  switch (a.kind) {
    case "quantity":
      return a.numberValue === b.numberValue;
    case "text":
      return normText(a.textValue ?? a.display) === normText(b.textValue ?? b.display);
    case "code":
      return normText(a.codeValue ?? a.display) === normText(b.codeValue ?? b.display);
    case "boolean":
      return a.booleanValue === b.booleanValue;
    case "entity_ref":
      return a.entityId === b.entityId;
    case "date":
      return normText(a.dateValue ?? a.display) === normText(b.dateValue ?? b.display);
    case "period":
      return (
        normText(a.periodStart) === normText(b.periodStart) &&
        normText(a.periodEnd) === normText(b.periodEnd)
      );
    default:
      return normText(a.display) === normText(b.display);
  }
}
