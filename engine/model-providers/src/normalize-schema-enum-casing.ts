type JsonSchemaNode = Record<string, unknown>;

function normalizeStringAgainstSchema(value: string, schema: JsonSchemaNode): string {
  if (typeof schema.const === "string") {
    return schema.const;
  }
  if (Array.isArray(schema.enum)) {
    for (const option of schema.enum) {
      if (typeof option === "string" && option.toLowerCase() === value.toLowerCase()) {
        return option;
      }
    }
  }
  return value;
}

function normalizeValue(value: unknown, schema: JsonSchemaNode | undefined): unknown {
  if (!schema || value === null || value === undefined) {
    return value;
  }

  const type = schema.type;
  if (type === "string" || (Array.isArray(type) && type.includes("string") && typeof value === "string")) {
    return normalizeStringAgainstSchema(value as string, schema);
  }

  if (type === "object" || schema.properties != null) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return value;
    }
    const properties = (schema.properties ?? {}) as Record<string, JsonSchemaNode>;
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...record };
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        normalized[key] = normalizeValue(record[key], childSchema);
      }
    }
    return normalized;
  }

  if (type === "array" && Array.isArray(value)) {
    const items = schema.items as JsonSchemaNode | undefined;
    return value.map((entry) => normalizeValue(entry, items));
  }

  if (Array.isArray(schema.anyOf) && typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const branch of schema.anyOf) {
      if (typeof branch !== "object" || branch === null) {
        continue;
      }
      const branchSchema = branch as JsonSchemaNode;
      if (branchSchema.type === "object" || branchSchema.properties != null) {
        return normalizeValue(value, branchSchema);
      }
    }
  }

  return value;
}

/** Case-insensitively align string enum/const values to the schema (Anthropic enum casing). */
export function normalizeJsonEnumCasing(parsed: unknown, schema: Record<string, unknown>): unknown {
  return normalizeValue(parsed, schema);
}
