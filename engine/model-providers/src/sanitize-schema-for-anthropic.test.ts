import { describe, expect, it } from "vitest";

import { sanitizeSchemaForAnthropic } from "./sanitize-schema-for-anthropic.js";

describe("sanitizeSchemaForAnthropic", () => {
  it("removes minimum and notes it in description; leaves input unchanged", () => {
    const input = {
      type: "object",
      additionalProperties: false,
      properties: {
        count: { type: "integer", minimum: 0, description: "item count" },
      },
      required: ["count"],
    };

    const output = sanitizeSchemaForAnthropic(input);

    expect(input.properties.count).toEqual({
      type: "integer",
      minimum: 0,
      description: "item count",
    });
    expect(output.properties.count).toEqual({
      type: "integer",
      description: "item count (minimum: 0)",
    });
  });

  it("removes minItems 2 and keeps minItems 1", () => {
    const input = {
      type: "object",
      additionalProperties: false,
      properties: {
        many: { type: "array", items: { type: "string" }, minItems: 2 },
        one: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["many", "one"],
    };

    const output = sanitizeSchemaForAnthropic(input);

    expect(output.properties.many).toEqual({
      type: "array",
      items: { type: "string" },
      description: "(minItems: 2)",
    });
    expect(output.properties.one).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
    });
  });
});
