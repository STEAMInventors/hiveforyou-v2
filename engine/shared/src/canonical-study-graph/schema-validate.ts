import type { JsonSchema } from "./json-schema.js";

export type ContractViolation = {
  path: string;
  message: string;
};

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ContractViolation[] };

export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ContractViolation[],
): void {
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path, message: `must be ${schema.type}` });
    return;
  }

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
    return;
  }

  if (schema.enum !== undefined && !schema.enum.some((entry) => Object.is(entry, value))) {
    errors.push({
      path,
      message: `must be one of: ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`,
    });
    return;
  }

  if (schema.type === "string" && typeof value === "string" && schema.minLength !== undefined) {
    if (value.length < schema.minLength) {
      errors.push({ path, message: `must be at least ${schema.minLength} character(s)` });
    }
  }

  if (
    (schema.type === "number" || schema.type === "integer") &&
    typeof value === "number" &&
    schema.minimum !== undefined &&
    value < schema.minimum
  ) {
    errors.push({ path, message: `must be >= ${schema.minimum}` });
  }

  if (schema.type === "object" || schema.properties || schema.required || schema.additionalProperties === false) {
    validateObject(value, schema, path, errors);
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateAgainstSchema(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }

  if (schema.oneOf) {
    const branchErrors: ContractViolation[][] = [];
    for (const branch of schema.oneOf) {
      const branchList: ContractViolation[] = [];
      validateAgainstSchema(value, branch, path, branchList);
      if (branchList.length === 0) {
        return;
      }
      branchErrors.push(branchList);
    }
    errors.push({ path, message: "must match exactly one schema variant" });
    void branchErrors;
  }
}

function matchesType(value: unknown, type: NonNullable<JsonSchema["type"]>): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function validateObject(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ContractViolation[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push({ path, message: "must be object" });
    return;
  }
  const record = value as Record<string, unknown>;
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in record) || record[key] === undefined) {
        errors.push({ path: `${path}.${key}`, message: "is required" });
      }
    }
  }
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in record && record[key] !== undefined) {
        validateAgainstSchema(record[key], propSchema, `${path}.${key}`, errors);
      }
    }
  }
  if (schema.additionalProperties === false && schema.properties) {
    for (const key of Object.keys(record)) {
      if (!(key in schema.properties)) {
        errors.push({ path: `${path}.${key}`, message: "additional property not allowed" });
      }
    }
  }
}

export function assertUniqueIds(
  items: readonly { id: string }[],
  path: string,
  errors: ContractViolation[],
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      errors.push({
        path: `${path}[${index}].id`,
        message: `duplicate id "${item.id}"`,
      });
    }
    seen.add(item.id);
  });
}
