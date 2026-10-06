export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pathJoin(base: string, ...segments: (string | number)[]): string {
  let current = base;
  for (const segment of segments) {
    if (current === "") {
      current = typeof segment === "number" ? `[${segment}]` : segment;
    } else if (typeof segment === "number") {
      current = `${current}[${segment}]`;
    } else {
      current = `${current}.${segment}`;
    }
  }
  return current;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export const DOCUMENT_TYPE_KEY_RE = /^[a-z][a-z0-9_]*$/;

export const BEHAVIOR_KEY_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;

/** Allowed boolean flags on window objects (closed set; extend here when packs add more). */
export const WINDOW_BOOLEAN_FLAGS = new Set(["full_calendar_months"]);

/** Allowed keys on case_attribute definitions (closed set). */
export const CASE_ATTRIBUTE_DEF_KEYS = new Set(["values", "source", "proposed_from"]);
