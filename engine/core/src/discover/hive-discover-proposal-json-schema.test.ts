import { describe, expect, it } from "vitest";

import {
  HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA,
  HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA,
} from "@hiveforyou/shared/discover";

type JsonSchemaNode = Record<string, unknown>;

function visitStrictObjectSchemas(
  node: unknown,
  path: string,
  onObject: (schema: JsonSchemaNode, path: string) => void,
): void {
  if (typeof node !== "object" || node === null) {
    return;
  }

  const schema = node as JsonSchemaNode;

  if (schema.type === "object" || schema.properties != null) {
    onObject(schema, path);
  }

  if (schema.items != null) {
    visitStrictObjectSchemas(schema.items, `${path}.items`, onObject);
  }

  if (schema.properties != null) {
    for (const [key, child] of Object.entries(
      schema.properties as Record<string, unknown>,
    )) {
      visitStrictObjectSchemas(child, `${path}.properties.${key}`, onObject);
    }
  }
}

function assertStrictOpenAISchema(schemaRoot: unknown, label: string): void {
  visitStrictObjectSchemas(schemaRoot, "root", (schema, path) => {
    expect(schema.additionalProperties, `${label} ${path}: additionalProperties must be false`).toBe(
      false,
    );

    const properties = schema.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(properties).sort();
    const requiredKeys = [...(schema.required as string[])].sort();

    expect(
      requiredKeys,
      `${label} ${path}: Set(required) must equal Set(properties keys)`,
    ).toEqual(propertyKeys);
  });
}

describe("HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA (OpenAI strict structured outputs)", () => {
  it("v1 requires every object property key", () => {
    assertStrictOpenAISchema(HIVE_DISCOVER_PROPOSAL_JSON_SCHEMA, "v1");
  });

  it("v2 requires every object property key", () => {
    assertStrictOpenAISchema(HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA, "v2");
  });

  it("v2 omits missingExpectedDocuments from the OpenAI contract", () => {
    const properties = (HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA as { properties: Record<string, unknown> })
      .properties;
    expect(properties.missingExpectedDocuments).toBeUndefined();
  });
});
