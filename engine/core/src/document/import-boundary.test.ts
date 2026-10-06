import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)));

const forbidden = [
  /from\s+["']pdfjs-dist/,
  /from\s+["']@napi-rs\/canvas/,
  /from\s+["']@gutenye\/ocr-node/,
  /from\s+["']@hiveforyou\/intake-node/,
];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith(".test.ts")) {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("document page-model import boundary", () => {
  it("does not import native PDF/OCR modules", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(text)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
