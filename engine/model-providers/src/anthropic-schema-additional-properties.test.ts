import { describe, expect, it } from "vitest";

import {
  assertAnthropicSchemaModeCoversMapTypedAdditionalProperties,
  resolveAnthropicSchemaMode,
} from "./anthropic-schema-mode.js";
import { REGISTERED_ANTHROPIC_JSON_SCHEMAS } from "./registered-anthropic-json-schemas.js";
import {
  findMapTypedAdditionalPropertiesPaths,
  getAdditionalPropertiesCoercionsForSchema,
  listAdditionalPropertiesCoercions,
  MapTypedAdditionalPropertiesError,
  sanitizeSchemaForAnthropic,
} from "./sanitize-schema-for-anthropic.js";

describe("additionalProperties policy", () => {
  it("refuses to coerce map-typed additionalProperties", () => {
    const input = {
      type: "object",
      additionalProperties: { type: "string" },
      properties: { id: { type: "string" } },
      required: ["id"],
    };

    expect(findMapTypedAdditionalPropertiesPaths(input)).toEqual([
      { path: "root", before: "schema" },
    ]);
    expect(listAdditionalPropertiesCoercions(input)).toEqual([]);
    expect(() => sanitizeSchemaForAnthropic(input)).toThrow(MapTypedAdditionalPropertiesError);
    expect(input.additionalProperties).toEqual({ type: "string" });
  });

  it("lists coercions for true and absent before sanitizing", () => {
    const input = {
      type: "object",
      additionalProperties: true,
      properties: {
        nested: {
          type: "object",
          properties: { a: { type: "string" } },
          required: ["a"],
        },
      },
      required: ["nested"],
    };

    expect(listAdditionalPropertiesCoercions(input)).toEqual([
      { path: "root", before: "true" },
      { path: "root.properties.nested", before: "absent" },
    ]);

    const output = sanitizeSchemaForAnthropic(input);
    expect(output.additionalProperties).toBe(false);
    expect(output.properties.nested.additionalProperties).toBe(false);
    expect(getAdditionalPropertiesCoercionsForSchema(input)).toEqual([
      { path: "root", before: "true" },
      { path: "root.properties.nested", before: "absent" },
    ]);
  });

  it("registered constrained schemas have no map-typed additionalProperties or are prompt mode", () => {
    assertAnthropicSchemaModeCoversMapTypedAdditionalProperties();

    for (const entry of REGISTERED_ANTHROPIC_JSON_SCHEMAS) {
      const mapPaths = findMapTypedAdditionalPropertiesPaths(entry.schema);
      const mode = resolveAnthropicSchemaMode(entry.name);
      if (mapPaths.length > 0) {
        expect(mode, entry.name).toBe("prompt");
        continue;
      }
      if (mode === "constrained") {
        expect(() => sanitizeSchemaForAnthropic(entry.schema)).not.toThrow();
      }
    }
  });
});
