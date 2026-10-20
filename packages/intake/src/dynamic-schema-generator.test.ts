import { describe, expect, it, vi } from "vitest";

import { generateEphemeralSchema } from "./dynamic-schema-generator";

describe("generateEphemeralSchema", () => {
  it("returns receipt schema and filter_and_sum task for junk food intent", async () => {
    const persistFn = vi.fn(async () => "schema-uuid-grocery");

    const result = await generateEphemeralSchema(
      { rawIntent: "How much junk food did I buy?", documentSamples: [] },
      persistFn,
    );

    expect(result.schemaId).toBe("schema-uuid-grocery");
    expect(result.schemaDefinition).toMatchObject({
      properties: {
        merchant: { type: "string" },
        total: { type: "number" },
        junk_food_flag: { type: "boolean" },
      },
    });
    expect(result.interpretedTask).toEqual({
      operation: "filter_and_sum",
      target_array: "items",
      filter_condition: "junk_food_flag == true",
    });
    expect(persistFn).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPrompt: "How much junk food did I buy?",
        interpretedTask: result.interpretedTask,
      }),
    );
  });

  it("returns generic key-value schema for other intents", async () => {
    const persistFn = vi.fn(async () => "schema-uuid-generic");

    const result = await generateEphemeralSchema(
      { rawIntent: "Summarize this document", documentSamples: ["sample text"] },
      persistFn,
    );

    expect(result.schemaId).toBe("schema-uuid-generic");
    expect(result.schemaDefinition).toMatchObject({
      properties: {
        key: { type: "string" },
        value: { type: "string" },
      },
    });
    expect(result.interpretedTask.operation).toBe("extract_key_values");
  });

  it("matches grocery keyword case-insensitively", async () => {
    const persistFn = vi.fn(async () => "schema-uuid-grocery-2");

    const result = await generateEphemeralSchema(
      { rawIntent: "GROCERY spending last month", documentSamples: [] },
      persistFn,
    );

    expect(result.schemaId).toBe("schema-uuid-grocery-2");
    expect(result.interpretedTask.operation).toBe("filter_and_sum");
  });
});
