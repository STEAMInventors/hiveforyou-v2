const REMOVED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "uniqueItems",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
] as const;

const sanitizeCache = new WeakMap<object, Record<string, unknown>>();

function isObjectSchemaNode(node: Record<string, unknown>): boolean {
  const type = node.type;
  if (type === "object") {
    return true;
  }
  return Array.isArray(type) && type.includes("object");
}

function appendDescription(existing: unknown, note: string): string {
  const base = typeof existing === "string" && existing.trim().length > 0 ? existing.trim() : "";
  return base ? `${base} ${note}` : note;
}

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeNode(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      sanitizeNode(child);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }

  const record = node as Record<string, unknown>;

  for (const keyword of REMOVED_KEYWORDS) {
    if (Object.prototype.hasOwnProperty.call(record, keyword)) {
      const value = record[keyword];
      delete record[keyword];
      record.description = appendDescription(record.description, `(${keyword}: ${JSON.stringify(value)})`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, "minItems")) {
    const minItems = record.minItems;
    if (minItems !== 0 && minItems !== 1) {
      delete record.minItems;
      record.description = appendDescription(record.description, `(minItems: ${JSON.stringify(minItems)})`);
    }
  }

  if (isObjectSchemaNode(record) && Object.prototype.hasOwnProperty.call(record, "additionalProperties")) {
    if (record.additionalProperties !== false) {
      const value = record.additionalProperties;
      record.additionalProperties = false;
      record.description = appendDescription(
        record.description,
        `(additionalProperties: ${JSON.stringify(value)})`,
      );
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "description" || key === "enum" || key === "required") {
      continue;
    }
    sanitizeNode(child);
  }
}

/** Returns a deep-cloned schema with Anthropic-incompatible keywords removed (constraints noted in descriptions). */
export function sanitizeSchemaForAnthropic(schema: Record<string, unknown>): Record<string, unknown> {
  const cached = sanitizeCache.get(schema);
  if (cached) {
    return cached;
  }
  const cloned = cloneJsonValue(schema);
  sanitizeNode(cloned);
  sanitizeCache.set(schema, cloned);
  return cloned;
}
