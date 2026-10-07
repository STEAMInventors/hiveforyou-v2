import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PACK_PRIMITIVE_MAP,
  PACK_STUDY_PRIMITIVES,
  type PackPrimitiveMapEntry,
} from "../packs-v2/primitive-map.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function parseEvidence(evidence: string): { relPath: string; line: number } {
  const idx = evidence.lastIndexOf(":");
  const relPath = evidence.slice(0, idx);
  const line = Number(evidence.slice(idx + 1));
  return { relPath, line };
}

describe("PACK_PRIMITIVE_MAP", () => {
  it("P10: exactly 18 keys, no extras", () => {
    expect(PACK_STUDY_PRIMITIVES.length).toBe(18);
    expect(Object.keys(PACK_PRIMITIVE_MAP).sort()).toEqual([...PACK_STUDY_PRIMITIVES].sort());
  });

  it("P13: P3 and P4 shape rules on every entry", () => {
    for (const name of PACK_STUDY_PRIMITIVES) {
      const entry = PACK_PRIMITIVE_MAP[name] as PackPrimitiveMapEntry;
      expect(entry.kind, name).toMatch(/^(check|selector|match)$/);
      expect(entry.status, name).toMatch(/^(implemented|partial|planned)$/);
      if (entry.status === "implemented" || entry.status === "partial") {
        expect(entry.runsAs, name).toBeTruthy();
        expect(entry.evidence, name).toBeTruthy();
      }
      if (entry.status === "partial" || entry.status === "planned") {
        expect(entry.gap?.trim(), name).toBeTruthy();
      }
    }
  });

  it("P12: evidence paths, line range, and runsAs on cited line", () => {
    for (const name of PACK_STUDY_PRIMITIVES) {
      const entry = PACK_PRIMITIVE_MAP[name] as PackPrimitiveMapEntry;
      if (!entry.evidence || !entry.runsAs) continue;
      const { relPath, line } = parseEvidence(entry.evidence);
      const abs = join(repoRoot, relPath);
      expect(existsSync(abs), entry.evidence).toBe(true);
      const lines = readFileSync(abs, "utf8").split(/\r?\n/);
      expect(line, entry.evidence).toBeGreaterThan(0);
      expect(line, entry.evidence).toBeLessThanOrEqual(lines.length);
      expect(lines[line - 1] ?? "", entry.evidence).toContain(entry.runsAs);
    }
  });
});
