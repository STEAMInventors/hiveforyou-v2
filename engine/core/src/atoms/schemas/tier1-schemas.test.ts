import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ModelJsonSchemaFormat } from "../../model/call-model";
import * as tier1Schemas from "./tier1-schemas";

const schemasDir = dirname(fileURLToPath(import.meta.url));

const schemaModules: Record<string, Record<string, unknown>> = {
  "tier1-schemas.ts": tier1Schemas as unknown as Record<string, unknown>,
};

function isCallModelSchema(value: unknown): value is ModelJsonSchemaFormat {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as ModelJsonSchemaFormat;
  return record.type === "json_schema" && typeof record.schema === "object" && record.schema !== null;
}

function loadCallModelSchemas(): ModelJsonSchemaFormat[] {
  const files = readdirSync(schemasDir).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  const schemas: ModelJsonSchemaFormat[] = [];
  for (const file of files) {
    const mod = schemaModules[file];
    if (!mod) {
      throw new Error(`${file} is not loaded by the strict CallModel schema test`);
    }
    for (const value of Object.values(mod)) {
      if (isCallModelSchema(value)) {
        schemas.push(value);
      }
    }
  }
  return schemas;
}

type JsonSchemaNode = Record<string, unknown>;

function isObjectSchema(schema: JsonSchemaNode): boolean {
  const type = schema.type;
  if (type === "object") {
    return true;
  }
  if (Array.isArray(type) && type.includes("object")) {
    return true;
  }
  return schema.properties != null;
}

function visitObjects(
  node: unknown,
  path: string,
  onObject: (schema: JsonSchemaNode, path: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => visitObjects(entry, `${path}[${index}]`, onObject));
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const schema = node as JsonSchemaNode;
  if (isObjectSchema(schema)) {
    onObject(schema, path);
  }
  if (schema.properties != null && typeof schema.properties === "object") {
    for (const [key, child] of Object.entries(schema.properties as Record<string, unknown>)) {
      visitObjects(child, `${path}.properties.${key}`, onObject);
    }
  }
  if (schema.items != null) {
    visitObjects(schema.items, `${path}.items`, onObject);
  }
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (schema[key] != null) {
      visitObjects(schema[key], `${path}.${key}`, onObject);
    }
  }
  for (const key of ["$defs", "definitions"] as const) {
    const defs = schema[key];
    if (typeof defs === "object" && defs !== null) {
      for (const [name, child] of Object.entries(defs as Record<string, unknown>)) {
        visitObjects(child, `${path}.${key}.${name}`, onObject);
      }
    }
  }
}

describe("atom CallModel JSON schemas", () => {
  it("requires every property and sets additionalProperties false on every object", () => {
    const schemas = loadCallModelSchemas();
    expect(schemas.map((schema) => schema.name).sort()).toEqual([
      "atom_document_profile",
      "atom_prose_statements",
    ]);

    for (const format of schemas) {
      visitObjects(format.schema, format.name, (schema, path) => {
        expect(schema.additionalProperties, `${path}: additionalProperties`).toBe(false);
        const properties = schema.properties;
        expect(properties, `${path}: properties`).toEqual(expect.any(Object));
        const propertyKeys = Object.keys(properties as Record<string, unknown>).sort();
        expect(Array.isArray(schema.required), `${path}: required`).toBe(true);
        const requiredKeys = [...(schema.required as string[])].sort();
        expect(requiredKeys, `${path}: required must equal property keys`).toEqual(propertyKeys);
      });
    }
  });
});
