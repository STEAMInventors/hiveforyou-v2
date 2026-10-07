import { describe, expect, it } from "vitest";
import * as core from "@hiveforyou/core";
import { PACK_PRIMITIVE_MAP } from "@hiveforyou/domain-packs/packs-v2/primitive-map";

describe("PACK_PRIMITIVE_MAP runsAs exports (P11)", () => {
  for (const [name, entry] of Object.entries(PACK_PRIMITIVE_MAP)) {
    if (!entry.runsAs) continue;
    it(`${name} -> ${entry.runsAs}`, () => {
      const fn = (core as Record<string, unknown>)[entry.runsAs!];
      expect(typeof fn).toBe("function");
    });
  }
});
