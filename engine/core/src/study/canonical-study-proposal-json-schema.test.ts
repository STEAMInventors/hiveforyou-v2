import { describe, expect, it } from "vitest";

import { CANONICAL_STUDY_PROPOSAL_V2_JSON_SCHEMA } from "@hiveforyou/shared/canonical-study";

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
    expect(schema.additionalProperties, `${label} ${path}: additionalProperties`).toBe(false);
    const properties = schema.properties as Record<string, unknown>;
    const propertyKeys = Object.keys(properties).sort();
    const requiredKeys = [...(schema.required as string[])].sort();
    expect(requiredKeys, `${label} ${path}: required keys`).toEqual(propertyKeys);
  });
}

describe("CANONICAL_STUDY_PROPOSAL_V2_JSON_SCHEMA", () => {
  it("satisfies OpenAI strict structured output object rules", () => {
    assertStrictOpenAISchema(CANONICAL_STUDY_PROPOSAL_V2_JSON_SCHEMA, "proposal-v2");
  });
});
