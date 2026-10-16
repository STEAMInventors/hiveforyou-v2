import { describe, expect, it } from "vitest";

import {
  findMapTypedAdditionalPropertiesPaths,
  getAdditionalPropertiesCoercionsForSchema,
  sanitizeSchemaForAnthropic,
} from "../../../../model-providers/src/sanitize-schema-for-anthropic.js";

import { HIVE_WRITER_RESPONSE_JSON_SCHEMA } from "./hive-writer-response-json-schema.js";

describe("HIVE_WRITER_RESPONSE_JSON_SCHEMA Anthropic constrained output", () => {
  it("uses element array (no map-typed additionalProperties under hiveUiTree)", () => {
    const mapPaths = findMapTypedAdditionalPropertiesPaths(HIVE_WRITER_RESPONSE_JSON_SCHEMA);
    expect(mapPaths.length).toBe(0);
    expect(
      mapPaths.some((entry) => entry.path.includes("hiveUiTree.properties.elements")),
    ).toBe(false);
  });

  it("sanitizes for Anthropic constrained json_schema", () => {
    expect(() => sanitizeSchemaForAnthropic(HIVE_WRITER_RESPONSE_JSON_SCHEMA)).not.toThrow();
    const sanitized = sanitizeSchemaForAnthropic(HIVE_WRITER_RESPONSE_JSON_SCHEMA);
    const hiveUiTree = sanitized.properties as Record<string, unknown>;
    const treeProps = (hiveUiTree.hiveUiTree as Record<string, unknown>).properties as Record<
      string,
      unknown
    >;
    expect((treeProps.elements as Record<string, unknown>).type).toBe("array");
  });

  it("lists additionalProperties coercions without map-typed nodes", () => {
    expect(getAdditionalPropertiesCoercionsForSchema(HIVE_WRITER_RESPONSE_JSON_SCHEMA)).toEqual([]);
    expect(() => sanitizeSchemaForAnthropic(HIVE_WRITER_RESPONSE_JSON_SCHEMA)).not.toThrow();
  });
});
