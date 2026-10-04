import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const forbiddenImport =
  /from\s+["']@hiveforyou\/domain-pack-(iep|medicaid|bankruptcy)["']/;

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("pack import boundary", () => {
  it("keeps Hive Core, Intake, and the web app off direct domain-pack imports", () => {
    const roots = [
      join(repoRoot, "engine/core"),
      join(repoRoot, "engine/intake"),
      join(repoRoot, "app/src"),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const text = readFileSync(file, "utf8");
        if (forbiddenImport.test(text)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
