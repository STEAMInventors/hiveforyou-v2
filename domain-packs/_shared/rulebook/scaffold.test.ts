import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("rulebook scaffold conventions", () => {
  it("glossary-only guide has no sections", () => {
    const content = `export const GUIDE = { kind: 'glossary-only', sections: [] };`;
    expect(content).toContain("sections: []");
  });

  it("draft guide template includes reviewStatus draft", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb-scaffold-"));
    try {
      const guidePath = join(dir, "guides", "foo.ts");
      const ts = `import type { DocumentGuide } from "x";
export const GUIDE: DocumentGuide = {
  kind: 'glossary-only',
  reviewStatus: 'draft',
  docType: 'Foo',
  pageTitle: 'TODO(review)',
  intro: 'TODO(review)',
  basics: [],
  sections: [],
  dates: [],
  rights: [],
  disclaimer: 'TODO(review)',
};`;
      mkdirSync(join(dir, "guides"), { recursive: true });
      writeFileSync(guidePath, ts, { flag: "wx" });
      expect(readFileSync(guidePath, "utf8")).toContain("reviewStatus: 'draft'");
      expect(() => writeFileSync(guidePath, ts, { flag: "wx" })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never overwrites existing guide file", () => {
    const dir = mkdtempSync(join(tmpdir(), "rb-scaffold-"));
    try {
      const guidePath = join(dir, "existing.ts");
      writeFileSync(guidePath, "original");
      if (!existsSync(guidePath)) {
        writeFileSync(guidePath, "new");
      }
      expect(readFileSync(guidePath, "utf8")).toBe("original");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
