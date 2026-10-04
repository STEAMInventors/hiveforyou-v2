import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith(".ts") && entry !== "boundary.test.ts") {
      files.push(path);
    }
  }
  return files;
}

describe("generic domain-pack package", () => {
  it("does not name IEP, Medicaid, or Bankruptcy rules", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const forbidden = [/IEP/, /Medicaid/, /Bankruptcy/, /Individualized Education/];
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(text, file).not.toMatch(pattern);
      }
    }
  });
});
