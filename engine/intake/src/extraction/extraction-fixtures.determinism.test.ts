import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Generator is plain JavaScript; the test only needs the exported function.
// @ts-expect-error no declaration file for the fixture script
import { generateExtractionFixtures } from "../../fixtures/extraction/generate-fixtures.mjs";

function hashTree(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const bytes = readFileSync(join(dir, name));
    hashes[name] = createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}

describe("extraction fixture generator", () => {
  it("writes identical bytes on two runs", async () => {
    const first = mkdtempSync(join(tmpdir(), "hive-fixtures-a-"));
    const second = mkdtempSync(join(tmpdir(), "hive-fixtures-b-"));
    try {
      await generateExtractionFixtures(first);
      await generateExtractionFixtures(second);
      expect(hashTree(second)).toEqual(hashTree(first));
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});
