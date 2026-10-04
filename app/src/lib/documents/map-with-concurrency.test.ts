import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "@hiveforyou/intake";

describe("mapWithConcurrency", () => {
  it("preserves order with concurrency > 1", async () => {
    const input = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(input, 3, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, 5 - n));
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });
});
