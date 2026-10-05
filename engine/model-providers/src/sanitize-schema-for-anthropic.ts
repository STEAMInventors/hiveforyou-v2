export type AdditionalPropertiesBeforeKind = "true" | "absent";

export type AdditionalPropertiesCoercion = {
  path: string;
  before: AdditionalPropertiesBeforeKind;
};

export type MapTypedAdditionalPropertiesPath = {
  path: string;
  before: "schema";
};

export class MapTypedAdditionalPropertiesError extends Error {
  readonly paths: MapTypedAdditionalPropertiesPath[];

  constructor(paths: MapTypedAdditionalPropertiesPath[]) {
    super(
      `Cannot coerce map-typed additionalProperties for Anthropic constrained output (${paths.map((p) => p.path).join(", ")}). Use prompt mode.`,
    );
    this.name = "MapTypedAdditionalPropertiesError";
    this.paths = paths;
  }
}

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

type SanitizeCacheEntry = {
  sanitized: Record<string, unknown>;
  additionalPropertiesCoercions: AdditionalPropertiesCoercion[];
};

const sanitizeCache = new WeakMap<object, SanitizeCacheEntry>();

function isObjectSchemaNode(node: Record<string, unknown>): boolean {
  const type = node.type;
  if (type === "object") {
    return true;
  }
  return Array.isArray(type) && type.includes("object");
}

function isMapTypedAdditionalProperties(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function visitSchemaNodes(
  node: unknown,
  visitFn: (record: Record<string, unknown>, path: string) => void,
  path = "root",
): void {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      visitSchemaNodes(child, visitFn, `${path}[${index}]`);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const record = node as Record<string, unknown>;
  visitFn(record, path);
  for (const [key, child] of Object.entries(record)) {
    if (key === "description" || key === "enum" || key === "required") {
      continue;
    }
    visitSchemaNodes(child, visitFn, `${path}.${key}`);
  }
}

/** Map-typed additionalProperties subschemas (cannot be coerced to false for Anthropic constrained mode). */
export function findMapTypedAdditionalPropertiesPaths(
  schema: Record<string, unknown>,
): MapTypedAdditionalPropertiesPath[] {
  const found: MapTypedAdditionalPropertiesPath[] = [];
  visitSchemaNodes(schema, (record, path) => {
    if (!isObjectSchemaNode(record)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(record, "additionalProperties")) {
      return;
    }
    const value = record.additionalProperties;
    if (isMapTypedAdditionalProperties(value)) {
      found.push({ path, before: "schema" });
    }
  });
  return found;
}

/** Paths where sanitizeSchemaForAnthropic would set additionalProperties to false. */
export function listAdditionalPropertiesCoercions(
  schema: Record<string, unknown>,
): AdditionalPropertiesCoercion[] {
  const coercions: AdditionalPropertiesCoercion[] = [];
  visitSchemaNodes(schema, (record, path) => {
    if (!isObjectSchemaNode(record)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(record, "additionalProperties")) {
      coercions.push({ path, before: "absent" });
      return;
    }
    const value = record.additionalProperties;
    if (value === false) {
      return;
    }
    if (value === true) {
      coercions.push({ path, before: "true" });
      return;
    }
    if (isMapTypedAdditionalProperties(value)) {
      return;
    }
  });
  return coercions;
}

export function getAdditionalPropertiesCoercionsForSchema(
  schema: Record<string, unknown>,
): AdditionalPropertiesCoercion[] {
  const cached = sanitizeCache.get(schema);
  if (cached) {
    return cached.additionalPropertiesCoercions;
  }
  return listAdditionalPropertiesCoercions(schema);
}

function assertNoMapTypedAdditionalProperties(schema: Record<string, unknown>): void {
  const mapPaths = findMapTypedAdditionalPropertiesPaths(schema);
  if (mapPaths.length > 0) {
    throw new MapTypedAdditionalPropertiesError(mapPaths);
  }
}

function sanitizeNode(
  node: unknown,
  coercions: AdditionalPropertiesCoercion[],
  path: string,
): void {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      sanitizeNode(child, coercions, `${path}[${index}]`);
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

  if (isObjectSchemaNode(record)) {
    if (Object.prototype.hasOwnProperty.call(record, "additionalProperties")) {
      const value = record.additionalProperties;
      if (isMapTypedAdditionalProperties(value)) {
        throw new MapTypedAdditionalPropertiesError([{ path, before: "schema" }]);
      }
      if (value === true) {
        record.additionalProperties = false;
        coercions.push({ path, before: "true" });
        record.description = appendDescription(record.description, "(additionalProperties: true)");
      }
    } else {
      record.additionalProperties = false;
      coercions.push({ path, before: "absent" });
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "description" || key === "enum" || key === "required") {
      continue;
    }
    sanitizeNode(child, coercions, `${path}.${key}`);
  }
}

/** Returns a deep-cloned schema with Anthropic-incompatible keywords removed (constraints noted in descriptions). */
export function sanitizeSchemaForAnthropic(schema: Record<string, unknown>): Record<string, unknown> {
  const cached = sanitizeCache.get(schema);
  if (cached) {
    return cached.sanitized;
  }

  assertNoMapTypedAdditionalProperties(schema);

  const cloned = cloneJsonValue(schema);
  const additionalPropertiesCoercions: AdditionalPropertiesCoercion[] = [];
  sanitizeNode(cloned, additionalPropertiesCoercions, "root");
  const entry = { sanitized: cloned, additionalPropertiesCoercions };
  sanitizeCache.set(schema, entry);
  return entry.sanitized;
}
