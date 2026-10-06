const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MDY = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

export function normalizeMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let negative = false;
  let inner = trimmed;
  if (/^\(.+\)$/.test(inner)) {
    negative = true;
    inner = inner.slice(1, -1).trim();
  }
  if (inner.startsWith("-")) {
    negative = true;
    inner = inner.slice(1).trim();
  }
  const cleaned = inner.replace(/[$,]/g, "");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) {
    return null;
  }
  return negative ? -value : value;
}

export function normalizeRateUnit(raw: string): { unit: string | null; per: string | null } {
  const lower = raw.toLowerCase();
  if (/\bweekly\b|\bper week\b/.test(lower)) {
    return { unit: null, per: "week" };
  }
  if (/\/bi-weekly\b|\bbi-weekly\b/.test(lower)) {
    return { unit: null, per: "bi-weekly" };
  }
  if (/\/year\b|\bper year\b|\bannually\b/.test(lower)) {
    return { unit: null, per: "year" };
  }
  return { unit: null, per: null };
}

export function normalizePartialDate(
  raw: string,
  documentYear: number | null,
  documentMonth: number | null,
): string | null {
  const trimmed = raw.trim();
  if (ISO_DATE.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const mdy = MDY.exec(trimmed);
  if (!mdy) {
    return null;
  }
  const month = Number.parseInt(mdy[1]!, 10);
  const day = Number.parseInt(mdy[2]!, 10);
  let year = mdy[3] ? Number.parseInt(mdy[3], 10) : documentYear;
  if (year != null && year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  if (year == null) {
    return null;
  }
  if (!mdy[3] && documentYear != null && documentMonth != null && month > documentMonth) {
    year = documentYear - 1;
  } else if (!mdy[3] && documentYear != null) {
    year = documentYear;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeAttributeRaw(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseDocumentAnchorDate(iso: string | null): { year: number; month: number } | null {
  if (!iso || !ISO_DATE.test(iso)) {
    return null;
  }
  const parts = iso.split("-");
  const y = Number.parseInt(parts[0] ?? "", 10);
  const m = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return null;
  }
  return { year: y, month: m };
}
